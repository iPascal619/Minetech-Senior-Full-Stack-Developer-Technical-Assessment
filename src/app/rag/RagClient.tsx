"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";

import { readChatStream } from "@/lib/chat-stream";

type DocumentSummary = {
  id: string;
  filename: string;
  created_at: string;
  content_length: number;
};

type Citation = {
  document_id: string;
  filename: string;
  excerpt: string;
  score: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  grounded: boolean;
  notInKnowledgeBase: boolean;
  createdAt: string;
  isTyping?: boolean;
};

type DocumentListResponse = {
  documents?: DocumentSummary[];
  error?: string;
};

type DocumentUploadResponse = {
  success?: boolean;
  document?: DocumentSummary;
  error?: string;
};

type ChatResponse = {
  success?: boolean;
  answer?: string;
  citations?: Citation[];
  grounded?: boolean;
  notInKnowledgeBase?: boolean;
  error?: string;
  retrieval_method?: string;
};

type DocumentDetail = {
  id: string;
  filename: string;
  content: string;
  created_at: string;
  content_length: number;
};

type DocumentDetailResponse = {
  success?: boolean;
  document?: DocumentDetail;
  error?: string;
};

type SavedChatMessage = Pick<ChatMessage, "role" | "text" | "citations" | "grounded" | "notInKnowledgeBase" | "createdAt">;

type SavedChatConversation = {
  id: string;
  title: string;
  savedAt: string;
  messages: SavedChatMessage[];
};

const SAVED_CHATS_STORAGE_KEY = "rag.saved-chats.v1";
const MAX_SAVED_CHATS = 10;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M4.5 2.75h4.9l2.85 2.85v7.65a1 1 0 0 1-1 1h-6.75a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M9.4 2.75v3.1h3.1" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M6 8h4M6 10.5h3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <ellipse cx="8" cy="3.5" rx="4.75" ry="1.75" stroke="currentColor" strokeWidth="1.25" />
      <path d="M3.25 3.5v4.5C3.25 8.97 5.38 10.25 8 10.25s4.75-1.28 4.75-2.25v-4.5" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M3.25 8v4.5C3.25 13.47 5.38 14.75 8 14.75s4.75-1.28 4.75-2.25V8" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M4 2.75v1.5M12 2.75v1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M3.25 5.5h9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="2.75" y="3.5" width="10.5" height="9.75" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 8h1.75M8 8h1.75M5 10.25h1.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function CitationIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M4.25 5.25h2.5v2.5H5.5c-.69 0-1.25.56-1.25 1.25v1.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.25 5.25h2.5v2.5H10.5c-.69 0-1.25.56-1.25 1.25v1.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M8 11V3.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M5.25 6 8 3.25 10.75 6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.75 12.5h8.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M12.5 6.25A4.75 4.75 0 0 0 4.1 4.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M4.1 4.1V6.9H6.9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 9.75A4.75 4.75 0 0 0 11.9 11.9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11.9 11.9V9.1H9.1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3.5 4.25h9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M6.25 4.25V3.5A.75.75 0 0 1 7 2.75h2A.75.75 0 0 1 9.75 3.5v.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M5.25 4.25l.5 8h4.5l.5-8" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M2.5 7.25L8 2.75l5.5 4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.25 6.75V13h7.5V6.75" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3.5 3.5h6.75A2.25 2.25 0 0 1 12.5 5.75v7.75H5.25A1.75 1.75 0 0 1 3.5 11.75V3.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M5.5 3.5v8.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3.25 8a4.75 4.75 0 1 1 1.39 3.36" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.25 4.5V8h3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M2.5 7.75 13 2.75l-2.25 10.5-2.5-4.25-5.75-1.25Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M10.5 5.5 6.25 9.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function HeroChip({ icon, children, className = "" }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-[8px] border-[0.5px] border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-normal leading-none text-slate-600",
        className,
      ].join(" ")}
    >
      <span className="text-slate-400">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

function MessageCitation({ index }: { index: number }) {
  return (
    <span className="inline-flex h-5 items-center rounded-[8px] border-[0.5px] border-sky-200 bg-sky-50 px-1.5 text-[11px] font-normal leading-none text-sky-800 align-middle">
      [{index}]
    </span>
  );
}

function formatFileSizeFromText(text: string) {
  return `${Math.max(1, Math.round(text.length / 4))} chars`;
}

export default function RagPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [addDocumentModalOpen, setAddDocumentModalOpen] = useState(false);
  const [documentsPanelOpen, setDocumentsPanelOpen] = useState(false);
  const [savedChatsMenuOpen, setSavedChatsMenuOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatStatusMessage, setChatStatusMessage] = useState<string | null>(null);
  const [savedChats, setSavedChats] = useState<SavedChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSource, setSelectedSource] = useState<DocumentDetail | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const documentNameInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const lastAutoSavedSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawSavedChats = window.localStorage.getItem(SAVED_CHATS_STORAGE_KEY);

      if (!rawSavedChats) {
        return;
      }

      const parsed = JSON.parse(rawSavedChats) as SavedChatConversation[];

      if (Array.isArray(parsed)) {
        setSavedChats(parsed);
      }
    } catch {
      setSavedChats([]);
    }
  }, []);

  useEffect(() => {
    const viewport = chatViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!addDocumentModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimeout = window.setTimeout(() => {
      documentNameInputRef.current?.focus();
    }, 25);

    return () => {
      window.clearTimeout(focusTimeout);
      document.body.style.overflow = previousOverflow;
    };
  }, [addDocumentModalOpen]);

  useEffect(() => {
    if (!documentsPanelOpen && !selectedSource && !sourceLoading && !sourceError) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [documentsPanelOpen, selectedSource, sourceLoading, sourceError]);

  useEffect(() => {
    if (!savedChatsMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [savedChatsMenuOpen]);

  useEffect(() => {
    if (asking || messages.length === 0 || messages.some((message) => message.isTyping)) {
      return;
    }

    const storedMessages = messages
      .filter((message) => !message.isTyping)
      .map((message) => ({
        role: message.role,
        text: message.text,
        citations: message.citations,
        grounded: message.grounded,
        notInKnowledgeBase: message.notInKnowledgeBase,
        createdAt: message.createdAt,
      }));

    if (storedMessages.length === 0) {
      return;
    }

    const snapshot = JSON.stringify(storedMessages);

    if (lastAutoSavedSnapshotRef.current === snapshot) {
      return;
    }

    const firstUserMessage = storedMessages.find((message) => message.role === "user")?.text;
    const titleSource = firstUserMessage ?? storedMessages[0]?.text ?? "Chat";
    const title = titleSource.length > 42 ? `${titleSource.slice(0, 39).trimEnd()}...` : titleSource;
    const conversationId = activeChatId ?? makeId();
    const savedConversation: SavedChatConversation = {
      id: conversationId,
      title,
      savedAt: new Date().toISOString(),
      messages: storedMessages,
    };

    lastAutoSavedSnapshotRef.current = snapshot;
    persistSavedChats([savedConversation, ...savedChats.filter((item) => item.id !== conversationId)].slice(0, MAX_SAVED_CHATS));

    if (!activeChatId) {
      setActiveChatId(conversationId);
    }
  }, [activeChatId, asking, messages, savedChats]);

  const latestDocument = documents[0] ?? null;
  const documentCountLabel = documents.length === 1 ? "1 document" : `${documents.length} documents`;
  const latestIngestionLabel = latestDocument ? formatDateOnly(latestDocument.created_at) : "No ingestions yet";

  function openAddDocumentModal() {
    setUploadError(null);
    setUploadMessage(null);
    setAddDocumentModalOpen(true);
  }

  function closeAddDocumentModal() {
    setAddDocumentModalOpen(false);
    setUploadError(null);
    setUploadMessage(null);
    setDocumentName("");
    setDocumentText("");
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openDocumentsPanel() {
    setDocumentError(null);
    void loadDocuments();
    setDocumentsPanelOpen(true);
  }

  function closeDocumentsPanel() {
    setDocumentsPanelOpen(false);
  }

  function restoreSavedChat(conversation: SavedChatConversation) {
    lastAutoSavedSnapshotRef.current = null;
    setActiveChatId(conversation.id);
    setSavedChatsMenuOpen(false);
    setMessages(
      conversation.messages.map((message) => ({
        id: makeId(),
        role: message.role,
        text: message.text,
        citations: message.citations,
        grounded: message.grounded,
        notInKnowledgeBase: message.notInKnowledgeBase,
        createdAt: message.createdAt,
      })),
    );
    setQuestion("");
    setChatError(null);
    setChatStatusMessage(`Loaded "${conversation.title}" from saved chats.`);
  }

  function handleFileDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();

    const droppedFile = event.dataTransfer.files?.[0] ?? null;

    if (!droppedFile) {
      return;
    }

    setSelectedFile(droppedFile);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function persistSavedChats(nextChats: SavedChatConversation[]) {
    setSavedChats(nextChats);

    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(SAVED_CHATS_STORAGE_KEY, JSON.stringify(nextChats));
    } catch {
      // Ignore storage failures so chat remains usable.
    }
  }

  function handleNewChat() {
    lastAutoSavedSnapshotRef.current = null;
    setActiveChatId(null);
    setSavedChatsMenuOpen(false);
    setMessages([]);
    setQuestion("");
    setChatError(null);
    setChatStatusMessage(null);
  }

  async function openCitationSource(citation: Citation) {
    setSourceError(null);
    setSourceLoading(true);

    try {
      const response = await fetch(`/api/documents/${citation.document_id}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as DocumentDetailResponse;

      if (!response.ok || !data.success || !data.document) {
        throw new Error(data.error ?? "Failed to load the cited document.");
      }

      setSelectedSource(data.document);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Failed to load the cited document.");
    } finally {
      setSourceLoading(false);
    }
  }

  function closeCitationSource() {
    setSelectedSource(null);
    setSourceError(null);
    setSourceLoading(false);
  }

  async function loadDocuments() {
    setDocumentError(null);

    try {
      const response = await fetch("/api/documents?limit=12", {
        cache: "no-store",
      });
      const data = (await response.json()) as DocumentListResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load the mining operations knowledge base.");
      }

      setDocuments(data.documents ?? []);
    } catch {
      setDocuments([]);
      setDocumentError("Failed to load the mining operations knowledge base.");
    }
  }

  async function handleDeleteDocument(documentId: string) {
    const confirmed = window.confirm(
      "Delete this site document from the mining operations knowledge base?",
    );

    if (!confirmed) {
      return;
    }

    setDeletingDocumentId(documentId);
    setDocumentError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Failed to delete the document.");
      }

      setDocuments((current) => current.filter((document) => document.id !== documentId));
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Failed to delete the document.");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile && !documentText.trim()) {
      setUploadError("Choose a file or paste site document text before uploading.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      let response: Response;

      if (selectedFile) {
        const formData = new FormData();

        formData.append("document", selectedFile);

        if (documentName.trim()) {
          formData.append("filename", documentName.trim());
        }

        response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: documentName.trim() || "site-document.txt",
            content: documentText,
          }),
        });
      }

      const data = (await response.json()) as DocumentUploadResponse;
      const savedDocument = data.document;

      if (!response.ok || !data.success || !savedDocument) {
        throw new Error(data.error ?? "Failed to store the mining document.");
      }

      setDocuments((current) => [savedDocument, ...current.filter((item) => item.id !== savedDocument.id)]);
      setDocumentName("");
      setDocumentText("");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadMessage(`Stored ${savedDocument.filename} in the mining operations knowledge base.`);
      closeAddDocumentModal();
      void loadDocuments();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to store the mining document.");
    } finally {
      setUploading(false);
    }
  }

  async function handleQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!question.trim()) {
      setChatError("Ask a mining operations question before sending it to the knowledge base.");
      return;
    }

    const pendingAssistantId = makeId();

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      text: question.trim(),
      citations: [],
      grounded: true,
      notInKnowledgeBase: false,
      createdAt: new Date().toISOString(),
    };

    const typingMessage: ChatMessage = {
      id: pendingAssistantId,
      role: "assistant",
      text: "",
      citations: [],
      grounded: true,
      notInKnowledgeBase: false,
      createdAt: new Date().toISOString(),
      isTyping: true,
    };

    setMessages((current) => [...current, userMessage, typingMessage]);
    setQuestion("");
    setChatError(null);
    setAsking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: userMessage.text }),
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as ChatResponse | null;

        throw new Error(data?.error ?? "Failed to answer the question.");
      }

      if (!contentType.includes("text/event-stream")) {
        const data = (await response.json().catch(() => null)) as ChatResponse | null;
        const answer = data?.answer;

        if (!data?.success || typeof answer !== "string") {
          throw new Error(data?.error ?? "Failed to answer the question.");
        }

        const assistantMessage: ChatMessage = {
          id: pendingAssistantId,
          role: "assistant",
          text: answer,
          citations: data.citations ?? [],
          grounded: Boolean(data.grounded),
          notInKnowledgeBase: Boolean(data.notInKnowledgeBase),
          createdAt: new Date().toISOString(),
        };

        setMessages((current) =>
          current.map((message) => (message.id === pendingAssistantId ? assistantMessage : message)),
        );

        return;
      }

      await readChatStream(response, {
        onMeta: (payload) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistantId
                ? {
                    ...message,
                    citations: (payload.citations ?? []) as Citation[],
                    grounded: Boolean(payload.grounded),
                    notInKnowledgeBase: Boolean(payload.notInKnowledgeBase),
                  }
                : message,
            ),
          );
        },
        onDelta: (chunk) => {
          if (!chunk) {
            return;
          }

          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistantId
                ? {
                    ...message,
                    text: `${message.text}${chunk}`,
                    isTyping: false,
                  }
                : message,
            ),
          );
        },
        onDone: (payload) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistantId
                ? {
                    ...message,
                    text: payload.answer ?? message.text,
                    citations: (payload.citations ?? message.citations) as Citation[],
                    grounded: Boolean(payload.grounded),
                    notInKnowledgeBase: Boolean(payload.notInKnowledgeBase),
                    isTyping: false,
                  }
                : message,
            ),
          );
        },
        onError: (message) => {
          throw new Error(message);
        },
      });
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== pendingAssistantId));
      setChatError(
        error instanceof Error ? error.message : "Failed to answer the mining operations question.",
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-3 py-4 text-slate-900 sm:px-4 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-4 rounded-[16px] border-[0.5px] border-slate-200 bg-white px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">
              Mining operations knowledge base
            </p>
            <h1 className="text-[20px] font-medium leading-tight text-slate-950">Site intelligence</h1>
            <p className="text-[13px] font-normal leading-5 text-slate-600">
              Ask questions against indexed site documents and get cited answers.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-medium text-slate-700">
              <Link
                href="/"
                className="inline-flex h-8 items-center gap-2 rounded-full border-[0.5px] border-slate-200 bg-white px-3 transition hover:bg-slate-50"
              >
                <HomeIcon />
                <span>Home</span>
              </Link>
              <Link
                href="/triage"
                className="inline-flex h-8 items-center gap-2 rounded-full border-[0.5px] border-slate-200 bg-white px-3 transition hover:bg-slate-50"
              >
                <BookIcon />
                <span>Incident Triage</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
            <button
              type="button"
              onClick={openAddDocumentModal}
              className="inline-flex h-16 w-full flex-col items-center justify-center gap-1 rounded-[18px] border-[0.5px] border-slate-200 bg-white px-2 text-[11px] font-medium leading-none text-slate-700 transition hover:bg-slate-50 lg:h-8 lg:w-auto lg:flex-row lg:gap-2 lg:rounded-full lg:px-3"
            >
              <UploadIcon />
              <span>Add</span>
              <span>document</span>
            </button>
            <button
              type="button"
              onClick={openDocumentsPanel}
              className="inline-flex h-16 w-full flex-col items-center justify-center gap-1 rounded-[18px] border-[0.5px] border-slate-200 bg-white px-2 text-[11px] font-medium leading-none text-slate-700 transition hover:bg-slate-50 lg:h-8 lg:w-auto lg:flex-row lg:gap-2 lg:rounded-full lg:px-3"
            >
              <DocumentIcon />
              <span>Documents</span>
            </button>
            <HeroChip icon={<DatabaseIcon />}>Knowledge base entries · {documentCountLabel}</HeroChip>
            <HeroChip icon={<CalendarIcon />}>Latest ingestion · {latestIngestionLabel}</HeroChip>
            <HeroChip icon={<CitationIcon />}>Citations in every reply</HeroChip>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <section className="hidden h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[16px] border-[0.5px] border-slate-200 bg-white lg:flex">
              <div className="flex items-start justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">Saved chats</p>
                  <h2 className="mt-1 text-[14px] font-medium text-slate-950">Previous conversations</h2>
                  <p className="mt-1 text-[11px] font-normal text-slate-500">
                    Automatically saved history for the current browser session.
                  </p>
                </div>

              </div>

              <div className="flex items-center justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-3 sm:px-5">
                <div className="space-y-0.5">
                  <p className="text-[12px] font-medium text-slate-900">{savedChats.length} saved chats</p>
                  <p className="text-[11px] font-normal text-slate-500">Current chats save automatically as you continue.</p>
                </div>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-[999px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <PlusIcon />
                  New chat
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                {savedChats.length === 0 ? (
                  <div className="grid min-h-[280px] place-items-center rounded-[16px] border-[0.5px] border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[12px] font-normal text-slate-500">
                    No saved chats yet. Store a conversation to keep it here.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {savedChats.map((conversation) => (
                      <li key={conversation.id} className="rounded-[16px] border-[0.5px] border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium leading-5 text-slate-950">{conversation.title}</p>
                            <p className="mt-0.5 text-[11px] font-normal leading-5 text-slate-500">
                              {conversation.messages.length} messages · {formatDate(conversation.savedAt)}
                            </p>
                            <p className="mt-2 max-h-10 overflow-hidden text-[12px] font-normal leading-5 text-slate-600">
                              {conversation.messages.find((message) => message.role === "user")?.text ?? "Conversation saved from this chat."}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => restoreSavedChat(conversation)}
                              className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                              <RestoreIcon />
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                persistSavedChats(savedChats.filter((item) => item.id !== conversation.id));
                                setChatStatusMessage("Saved chat removed.");
                              }}
                              className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <TrashIcon />
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t-[0.5px] border-slate-200 px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[999px] border-[0.5px] border-slate-900 bg-slate-900 px-4 text-[12px] font-medium text-white transition hover:bg-slate-800"
                >
                  <PlusIcon />
                  Start fresh
                </button>
              </div>
            </section>

          <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[16px] border-[0.5px] border-slate-200 bg-white">
            <div className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <h2 className="text-[14px] font-medium leading-5 text-slate-950">Site intelligence chat</h2>
                  <p className="text-[12px] font-normal leading-5 text-slate-600">
                    Ask about safety procedures, drill operations, or production data.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={() => setSavedChatsMenuOpen(true)}
                    className="inline-flex h-8 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 lg:hidden"
                  >
                    Saved chats
                  </button>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
                  >
                    <PlusIcon />
                    New chat
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] font-normal text-slate-500">
                Saved chats: {savedChats.length} {chatStatusMessage ? `• ${chatStatusMessage}` : null}
              </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col border-t-[0.5px] border-slate-200">
              <div
                ref={chatViewportRef}
                className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
              >
                {chatError ? (
                  <div className="mb-4 rounded-[12px] border-[0.5px] border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-normal text-rose-700">
                    {chatError}
                  </div>
                ) : null}

                {messages.length === 0 ? (
                  <div className="grid h-full min-h-[240px] place-items-center px-4 text-center sm:px-6">
                    <p className="max-w-[320px] text-[13px] font-normal leading-[1.6] text-slate-500">
                      Ready when you are. Try asking: "What are the safety protocols for shaft B2?" or "Summarise the latest inspection report."
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const isAssistant = message.role === "assistant";
                      const bubbleClasses = isAssistant
                        ? "border-[0.5px] border-slate-200 bg-white text-slate-700"
                        : "border-[0.5px] border-slate-200 bg-slate-50 text-slate-700";

                      return (
                        <div
                          key={message.id}
                          className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                        >
                          <div className={`max-w-[92%] rounded-[12px] px-3.5 py-2.5 text-[13px] font-normal leading-6 sm:max-w-[85%] lg:max-w-[75%] ${bubbleClasses}`}>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-3 text-[11px] font-normal text-slate-500">
                                <span>{isAssistant ? "Assistant" : "You"}</span>
                                <span>{formatDate(message.createdAt)}</span>
                              </div>

                              {message.isTyping ? (
                                <div className="space-y-2">
                                  {message.text ? <p className="whitespace-pre-wrap">{message.text}</p> : null}
                                  <div className="flex items-center gap-1.5 text-slate-500" aria-live="polite">
                                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "140ms" }} />
                                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "280ms" }} />
                                    <span className="pl-1 text-[12px] font-normal text-slate-500">Thinking through the indexed documents…</span>
                                  </div>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap">
                                  {message.text}
                                  {isAssistant && message.citations.length > 0 ? (
                                    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                                      {message.citations.map((citation, citationIndex) => (
                                        <button
                                          key={`${citation.document_id}-${citationIndex}`}
                                          type="button"
                                          onClick={() => void openCitationSource(citation)}
                                          className="inline-flex align-middle"
                                          aria-label={`Open source ${citation.filename}`}
                                          title={citation.filename}
                                        >
                                          <MessageCitation index={citationIndex + 1} />
                                        </button>
                                      ))}
                                    </span>
                                  ) : null}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <form className="border-t-[0.5px] border-slate-200 p-3 sm:p-3" onSubmit={handleQuestionSubmit}>
                <div className="relative">
                  <input
                    value={question}
                    maxLength={2000}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Ask a question about your site documents…"
                    className="h-11 w-full rounded-full border-[0.5px] border-slate-200 bg-white px-4 pr-14 text-[13px] font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100"
                  />
                  <button
                    type="submit"
                    disabled={asking}
                    className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-slate-900 bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Send question"
                    title="Send question"
                  >
                    <SendIcon />
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>

        {savedChatsMenuOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] lg:hidden" onClick={() => setSavedChatsMenuOpen(false)}>
            <aside
              className="flex h-full w-full max-w-[82vw] flex-col border-r-[0.5px] border-slate-200 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">Saved chats</p>
                  <h2 className="mt-1 text-[14px] font-medium text-slate-950">Chat history</h2>
                  <p className="mt-1 text-[11px] font-normal text-slate-500">
                    Tap a chat to restore it into the main conversation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSavedChatsMenuOpen(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Close saved chats menu"
                >
                  ×
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-3 sm:px-5">
                <div className="space-y-0.5">
                  <p className="text-[12px] font-medium text-slate-900">{savedChats.length} saved chats</p>
                  <p className="text-[11px] font-normal text-slate-500">Current chats save automatically as you continue.</p>
                </div>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-[999px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <PlusIcon />
                  New chat
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                {savedChats.length === 0 ? (
                  <div className="grid min-h-[280px] place-items-center rounded-[16px] border-[0.5px] border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[12px] font-normal text-slate-500">
                    No saved chats yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {savedChats.map((conversation) => (
                      <li key={conversation.id} className="rounded-[16px] border-[0.5px] border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium leading-5 text-slate-950">{conversation.title}</p>
                            <p className="mt-0.5 text-[11px] font-normal leading-5 text-slate-500">
                              {conversation.messages.length} messages · {formatDate(conversation.savedAt)}
                            </p>
                            <p className="mt-2 max-h-10 overflow-hidden text-[12px] font-normal leading-5 text-slate-600">
                              {conversation.messages.find((message) => message.role === "user")?.text ?? "Conversation saved from this chat."}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => restoreSavedChat(conversation)}
                              className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                              <RestoreIcon />
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                persistSavedChats(savedChats.filter((item) => item.id !== conversation.id));
                                setChatStatusMessage("Saved chat removed.");
                              }}
                              className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <TrashIcon />
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        ) : null}

        {addDocumentModalOpen ? (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/35 px-3 py-3 backdrop-blur-[1px] sm:items-center sm:px-4 sm:py-6"
            onClick={closeAddDocumentModal}
          >
            <div
              className="w-full max-w-2xl rounded-[20px] border-[0.5px] border-slate-200 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">Add document</p>
                  <h3 className="mt-1 text-[14px] font-medium text-slate-950">Index a site document</h3>
                  <p className="mt-1 text-[11px] font-normal text-slate-500">
                    Upload a file or paste extracted report text into the knowledge base.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAddDocumentModal}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Close add document modal"
                >
                  ×
                </button>
              </div>

              <form className="space-y-4 px-4 py-4 sm:px-5" onSubmit={handleUpload}>
                <label className="block space-y-1.5">
                  <span className="block text-[12px] font-medium text-slate-500">Document name (optional)</span>
                  <input
                    ref={documentNameInputRef}
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    placeholder="e.g. shaft-b2-inspection.txt"
                    className="h-10 w-full rounded-[10px] border-[0.5px] border-slate-200 bg-white px-3 text-[13px] font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100"
                  />
                </label>

                <div className="relative space-y-1.5">
                  <span className="block text-[12px] font-medium text-slate-500">Upload file</span>
                  <input
                    id="rag-upload-input"
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.pdf"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  <label
                    htmlFor="rag-upload-input"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleFileDrop}
                    className="relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-[14px] border-[0.5px] border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-slate-400 hover:bg-slate-100/60"
                  >
                    {selectedFile ? (
                      <div className="flex max-w-full items-start gap-3 text-left">
                        <span className="mt-0.5 text-slate-500">
                          <UploadIcon />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-900">{selectedFile.name}</p>
                          <p className="mt-1 text-[11px] font-normal text-slate-500">{formatFileSize(selectedFile.size)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-slate-500">
                          <UploadIcon />
                        </span>
                        <p className="text-[13px] font-normal text-slate-600">Drop a file here or click to browse</p>
                        <p className="text-[11px] font-normal text-slate-500">Supports .txt and .pdf</p>
                      </div>
                    )}
                  </label>
                  {selectedFile ? (
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      className="absolute right-3 top-10 inline-flex h-6 w-6 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white text-[13px] font-medium leading-none text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                      aria-label="Clear selected file"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                <label className="block space-y-1.5">
                  <span className="block text-[12px] font-medium text-slate-500">Or paste document text</span>
                  <textarea
                    value={documentText}
                    onChange={(event) => setDocumentText(event.target.value)}
                    placeholder="Paste extracted report text here…"
                    className="h-[140px] w-full resize-none rounded-[14px] border-[0.5px] border-slate-200 bg-white px-3 py-2.5 text-[13px] font-normal leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={uploading}
                    className="inline-flex h-9 items-center justify-center rounded-[999px] border-[0.5px] border-slate-900 bg-slate-900 px-4 text-[12px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? "Indexing document..." : "Index document"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocumentName("");
                      setDocumentText("");
                      clearSelectedFile();
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-[999px] border-[0.5px] border-slate-200 bg-white px-4 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </form>

              <div className="space-y-2 border-t-[0.5px] border-slate-200 px-4 py-4 sm:px-5">
                {uploadError ? (
                  <div className="rounded-[12px] border-[0.5px] border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-normal text-rose-700">
                    {uploadError}
                  </div>
                ) : null}

                {uploadMessage ? (
                  <div className="rounded-[12px] border-[0.5px] border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-normal text-emerald-800">
                    {uploadMessage}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {documentsPanelOpen ? (
          <div
            className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
            onClick={closeDocumentsPanel}
          >
            <aside
              className="absolute right-0 top-0 flex h-full w-full max-w-[28rem] flex-col border-l-[0.5px] border-slate-200 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">Documents</p>
                  <h3 className="mt-1 text-[14px] font-medium text-slate-950">Stored knowledge base entries</h3>
                  <p className="mt-1 text-[11px] font-normal text-slate-500">
                    Browse indexed site documents and remove entries you no longer need.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDocumentsPanel}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Close documents panel"
                >
                  ×
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-3 sm:px-5">
                <div className="space-y-0.5">
                  <p className="text-[12px] font-medium text-slate-900">{documentCountLabel}</p>
                  <p className="text-[11px] font-normal text-slate-500">Latest ingestion · {latestIngestionLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadDocuments()}
                  className="inline-flex h-8 items-center justify-center rounded-[999px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <RefreshIcon />
                  <span className="ml-2">Refresh</span>
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                {documentError ? (
                  <div className="mb-3 rounded-[12px] border-[0.5px] border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-normal text-rose-700">
                    {documentError}
                  </div>
                ) : null}

                {documents.length === 0 ? (
                  <div className="grid min-h-[280px] place-items-center rounded-[16px] border-[0.5px] border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[12px] font-normal text-slate-500">
                    No documents indexed yet. Add a document to start grounding answers.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {documents.map((document) => (
                      <li key={document.id} className="rounded-[16px] border-[0.5px] border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 shrink-0 text-slate-400">
                                <DocumentIcon />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium leading-5 text-slate-950">
                                  {document.filename}
                                </p>
                                <p className="mt-0.5 text-[11px] font-normal leading-5 text-slate-500">
                                  {document.content_length.toLocaleString()} characters · {formatDateOnly(document.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleDeleteDocument(document.id)}
                            disabled={deletingDocumentId === document.id}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={`Delete ${document.filename}`}
                            title="Delete"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t-[0.5px] border-slate-200 px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => {
                    closeDocumentsPanel();
                    openAddDocumentModal();
                  }}
                  className="inline-flex h-9 w-full items-center justify-center rounded-[999px] border-[0.5px] border-slate-900 bg-slate-900 px-4 text-[12px] font-medium text-white transition hover:bg-slate-800"
                >
                  <UploadIcon />
                  <span className="ml-2">Add document</span>
                </button>
              </div>
            </aside>
          </div>
        ) : null}

        {selectedSource || sourceLoading || sourceError ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6 backdrop-blur-[1px]">
            <div className="w-full max-w-2xl rounded-[16px] border-[0.5px] border-slate-200 bg-white shadow-none">
              <div className="flex items-start justify-between gap-3 border-b-[0.5px] border-slate-200 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">Source document</p>
                  <h3 className="mt-1 truncate text-[14px] font-medium text-slate-950">
                    {selectedSource?.filename ?? "Loading source..."}
                  </h3>
                  {selectedSource ? (
                    <p className="mt-1 text-[11px] font-normal text-slate-500">
                      {selectedSource.content_length.toLocaleString()} characters · {formatDate(selectedSource.created_at)}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={closeCitationSource}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Close source viewer"
                >
                  ×
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
                {sourceLoading ? (
                  <p className="text-[12px] font-normal text-slate-500">Loading source document...</p>
                ) : sourceError ? (
                  <p className="rounded-[12px] border-[0.5px] border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-normal text-rose-700">
                    {sourceError}
                  </p>
                ) : selectedSource ? (
                  <div className="space-y-3">
                    <div className="rounded-[12px] border-[0.5px] border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-normal leading-6 text-slate-700">
                      <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">Excerpt</p>
                      <p className="mt-1 whitespace-pre-wrap">{selectedSource.content.slice(0, 360)}</p>
                    </div>
                    <div className="rounded-[12px] border-[0.5px] border-slate-200 bg-white px-3 py-2 text-[12px] font-normal leading-6 text-slate-700">
                      <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-slate-500">Full text</p>
                      <p className="mt-1 whitespace-pre-wrap">{selectedSource.content}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard?.writeText(selectedSource.content)}
                        className="inline-flex h-8 items-center justify-center rounded-[8px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Copy text
                      </button>
                      <span className="text-[11px] font-normal text-slate-500">
                        {formatFileSizeFromText(selectedSource.content)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

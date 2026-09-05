import { useEffect, useState } from "react";
import { DOCUMENTS } from "../data/mockData";
import type { FirmDocument } from "../types";

const STORAGE_KEY = "reggraph-documents-v1";

function load(): FirmDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FirmDocument[];
  } catch {
    // malformed or inaccessible storage — fall back to the seed dataset
  }
  return DOCUMENTS;
}

type Updater = FirmDocument[] | ((prev: FirmDocument[]) => FirmDocument[]);

// Shares document state across browser tabs/windows via localStorage, so an
// ingestion made on the separate upload console shows up live on the search
// screen — standing in for the real pipeline, where the firm's scraping
// tool feeds changes into the app directly and a lawyer never touches the
// upload flow at all.
export function useSharedDocuments(): [FirmDocument[], (update: Updater) => void] {
  const [documents, setDocumentsState] = useState<FirmDocument[]>(load);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setDocumentsState(JSON.parse(e.newValue) as FirmDocument[]);
        } catch {
          // ignore a malformed update written by another tab
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function setDocuments(update: Updater) {
    setDocumentsState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode, quota) — local state still updates
      }
      return next;
    });
  }

  return [documents, setDocuments];
}

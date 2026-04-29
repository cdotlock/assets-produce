"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/app/components/client-utils";
import type {
  EpisodeSummary,
  DomainResources,
} from "../types";

export interface UseVideoDataReturn {
  episodes: EpisodeSummary[];
  isLoadingEpisodes: boolean;
  isUploading: boolean;
  selectedEpisode: EpisodeSummary | null;
  selectEpisode: (ep: EpisodeSummary | null) => void;
  resources: DomainResources | null;
  isLoadingResources: boolean;
  refreshEpisodes: () => Promise<EpisodeSummary[]>;
  refreshResources: () => Promise<void>;
  refreshAll: () => Promise<void>;
  uploadEpisode: (scriptKey: string, scriptName: string | null, content: string | null) => Promise<void>;
  deleteEpisode: (scriptId: string) => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
}

export function useVideoData(novelId: string): UseVideoDataReturn {
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeSummary | null>(null);
  const [resources, setResources] = useState<DomainResources | null>(null);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshEpisodes = useCallback(async (): Promise<EpisodeSummary[]> => {
    setIsLoadingEpisodes(true);
    try {
      const data = await fetchJson<EpisodeSummary[]>(
        `/api/video/novels/${encodeURIComponent(novelId)}/episodes`,
      );
      setEpisodes(data);
      return data;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load episodes");
      return [];
    } finally {
      setIsLoadingEpisodes(false);
    }
  }, [novelId]);

  const refreshResources = useCallback(async () => {
    if (!selectedEpisode) {
      console.warn("[refreshResources] SKIPPED — selectedEpisode is null");
      setResources(null);
      return;
    }
    console.log(`[refreshResources] fetching for episode=${selectedEpisode.id}`);
    setIsLoadingResources(true);
    try {
      const data = await fetchJson<DomainResources>(
        `/api/video/episodes/${encodeURIComponent(selectedEpisode.id)}/resources?novelId=${encodeURIComponent(novelId)}`,
      );
      console.log(`[refreshResources] got: categories=${data.categories.length}`);
      setResources(data);
    } catch (err: unknown) {
      console.error("[refreshResources] FAILED:", err);
      setError(err instanceof Error ? err.message : "Failed to load resources");
    } finally {
      setIsLoadingResources(false);
    }
  }, [selectedEpisode, novelId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshEpisodes(), refreshResources()]);
  }, [refreshEpisodes, refreshResources]);

  const selectEpisode = useCallback((ep: EpisodeSummary | null) => {
    setSelectedEpisode(ep);
    setResources(null);
  }, []);

  const uploadEpisode = useCallback(
    async (scriptKey: string, scriptName: string | null, content: string | null) => {
      setIsUploading(true);
      try {
        await fetchJson(
          `/api/video/novels/${encodeURIComponent(novelId)}/episodes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scriptKey, scriptName, scriptContent: content }),
          },
        );
        await refreshEpisodes();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to create episode");
      } finally {
        setIsUploading(false);
      }
    },
    [novelId, refreshEpisodes],
  );

  const deleteEpisode = useCallback(
    async (scriptId: string) => {
      try {
        await fetchJson(
          `/api/video/episodes/${encodeURIComponent(scriptId)}`,
          { method: "DELETE" },
        );
      // Deselect if deleted EP was selected
      if (selectedEpisode?.id === scriptId) {
          setSelectedEpisode(null);
          setResources(null);
        }
        await refreshEpisodes();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to delete episode");
      }
    },
    [selectedEpisode, refreshEpisodes],
  );

  // Load episodes on mount
  useEffect(() => {
    void refreshEpisodes();
  }, [refreshEpisodes]);

  // Load resources when episode changes
  useEffect(() => {
    if (selectedEpisode) {
      void refreshResources();
    }
  }, [selectedEpisode, refreshResources]);

  return {
    episodes,
    isLoadingEpisodes,
    isUploading,
    selectedEpisode,
    selectEpisode,
    resources,
    isLoadingResources,
    refreshEpisodes,
    refreshResources,
    refreshAll,
    uploadEpisode,
    deleteEpisode,
    error,
    setError,
  };
}

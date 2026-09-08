import { useState, useRef, useEffect, useCallback } from 'react';
import { getPlayableUrl } from '../lib/driveService';

export interface PlayingState {
  currentTime: number;
  duration: number;
}

export interface UseAudioEngineResult {
  playingStates: Record<string, PlayingState>;
  playAudio: (
    key: string,
    url: string,
    onEnded?: () => void,
    onError?: (err: any) => void
  ) => Promise<HTMLAudioElement | null>;
  stopAudio: (key: string) => void;
  stopAllAudios: () => void;
  isAudioPlaying: (key?: string) => boolean;
  getAudioElement: (key: string) => HTMLAudioElement | undefined;
}

export function useAudioEngine(): UseAudioEngineResult {
  const playingAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingStates, setPlayingStates] = useState<Record<string, PlayingState>>({});

  const stopAudio = useCallback((key: string) => {
    const audio = playingAudiosRef.current.get(key);
    if (audio) {
      try {
        audio.pause();
        audio.src = '';
      } catch (e) {
        console.warn('Error stopping audio:', e);
      }
      playingAudiosRef.current.delete(key);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  }, []);

  const stopAllAudios = useCallback(() => {
    for (const audio of playingAudiosRef.current.values()) {
      try {
        audio.pause();
        audio.src = '';
      } catch (e) {
        console.warn('Error stopping audio:', e);
      }
    }
    playingAudiosRef.current.clear();
    setPlayingStates({});
  }, []);

  const playAudio = useCallback(async (
    key: string,
    url: string,
    onEnded?: () => void,
    onError?: (err: any) => void
  ): Promise<HTMLAudioElement | null> => {
    // If already playing this key, stop it first
    if (playingAudiosRef.current.has(key)) {
      stopAudio(key);
    }

    const playableUrl = getPlayableUrl(url);
    if (!playableUrl) {
      if (onError) onError(new Error('Invalid or unplayable URL'));
      return null;
    }

    const audio = new Audio(playableUrl);

    const updateProgress = () => {
      setPlayingStates(prev => ({
        ...prev,
        [key]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
      }));
    };

    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);

    audio.addEventListener('ended', () => {
      playingAudiosRef.current.delete(key);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      if (onEnded) onEnded();
    });

    audio.addEventListener('error', (err) => {
      playingAudiosRef.current.delete(key);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      if (onError) onError(err);
    });

    try {
      await audio.play();
      playingAudiosRef.current.set(key, audio);
      setPlayingStates(prev => ({
        ...prev,
        [key]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
      }));
      return audio;
    } catch (err) {
      playingAudiosRef.current.delete(key);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      if (onError) onError(err);
      throw err;
    }
  }, [stopAudio]);

  const isAudioPlaying = useCallback((key?: string): boolean => {
    if (key) {
      const audio = playingAudiosRef.current.get(key);
      return !!(audio && !audio.paused);
    }
    return playingAudiosRef.current.size > 0;
  }, []);

  const getAudioElement = useCallback((key: string) => {
    return playingAudiosRef.current.get(key);
  }, []);

  // Global window listeners for electron/navigation safety
  useEffect(() => {
    (window as any).interstitialerIsAudioPlaying = () => isAudioPlaying();
    (window as any).interstitialerStopAllAudio = () => stopAllAudios();

    return () => {
      delete (window as any).interstitialerIsAudioPlaying;
      delete (window as any).interstitialerStopAllAudio;
    };
  }, [isAudioPlaying, stopAllAudios]);

  // Clean up all audios on component unmount
  useEffect(() => {
    return () => {
      stopAllAudios();
    };
  }, [stopAllAudios]);

  return {
    playingStates,
    playAudio,
    stopAudio,
    stopAllAudios,
    isAudioPlaying,
    getAudioElement,
  };
}

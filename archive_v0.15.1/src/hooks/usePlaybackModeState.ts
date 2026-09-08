/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { Show } from '../types';

export interface PrerecordConfirmDetails {
  startDate: Date;
  endDate: Date;
  totalMinutes: number;
}

export function usePlaybackModeState() {
  const [playMode, setPlayMode] = useState<'Live' | 'Prerecord' | 'Export' | 'Playlist'>('Live');
  const [prerecordDate, setPrerecordDate] = useState<Date | null>(null);
  const [prerecordLengthMinutes, setPrerecordLengthMinutes] = useState<number>(300);
  const [selectedPlaylistShow, setSelectedPlaylistShow] = useState<Show | null>(null);
  const [selectedPrerecordShowId, setSelectedPrerecordShowId] = useState<string>('');
  const [prerecordModalTarget, setPrerecordModalTarget] = useState<'Prerecord' | 'Export'>('Prerecord');
  const [prerecordSelectorMode, setPrerecordSelectorMode] = useState<'show-list' | 'manual'>('show-list');
  const [prerecordConfirmDetails, setPrerecordConfirmDetails] = useState<PrerecordConfirmDetails | null>(null);
  const [showPrerecordConfirmStep, setShowPrerecordConfirmStep] = useState(false);

  const resetToLiveMode = useCallback(() => {
    setPlayMode('Live');
    setPrerecordDate(null);
    setPrerecordLengthMinutes(300);
    setSelectedPlaylistShow(null);
    setSelectedPrerecordShowId('');
    setPrerecordConfirmDetails(null);
    setShowPrerecordConfirmStep(false);
  }, []);

  return {
    playMode,
    setPlayMode,
    prerecordDate,
    setPrerecordDate,
    prerecordLengthMinutes,
    setPrerecordLengthMinutes,
    selectedPlaylistShow,
    setSelectedPlaylistShow,
    selectedPrerecordShowId,
    setSelectedPrerecordShowId,
    prerecordModalTarget,
    setPrerecordModalTarget,
    prerecordSelectorMode,
    setPrerecordSelectorMode,
    prerecordConfirmDetails,
    setPrerecordConfirmDetails,
    showPrerecordConfirmStep,
    setShowPrerecordConfirmStep,
    resetToLiveMode,
  };
}

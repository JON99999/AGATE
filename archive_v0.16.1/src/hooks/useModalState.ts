/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

export function useModalState() {
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showPrerecordModal, setShowPrerecordModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDriveHelpModal, setShowDriveHelpModal] = useState(false);
  const [showLocalHelpModal, setShowLocalHelpModal] = useState(false);
  const [showSaveRecoveryModal, setShowSaveRecoveryModal] = useState(false);
  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false);
  const [showCachingModal, setShowCachingModal] = useState(false);

  const closeAllModals = useCallback(() => {
    setShowLocationsModal(false);
    setShowPlaylistModal(false);
    setShowPrerecordModal(false);
    setShowExportModal(false);
    setShowDriveHelpModal(false);
    setShowLocalHelpModal(false);
    setShowSaveRecoveryModal(false);
    setShowScheduleAuditModal(false);
    setShowCachingModal(false);
  }, []);

  return {
    showLocationsModal,
    setShowLocationsModal,
    showPlaylistModal,
    setShowPlaylistModal,
    showPrerecordModal,
    setShowPrerecordModal,
    showExportModal,
    setShowExportModal,
    showDriveHelpModal,
    setShowDriveHelpModal,
    showLocalHelpModal,
    setShowLocalHelpModal,
    showSaveRecoveryModal,
    setShowSaveRecoveryModal,
    showScheduleAuditModal,
    setShowScheduleAuditModal,
    showCachingModal,
    setShowCachingModal,
    closeAllModals,
  };
}

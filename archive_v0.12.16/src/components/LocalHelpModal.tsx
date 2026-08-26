/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, HelpCircle, HardDrive, Network, ShieldCheck, Download } from 'lucide-react';

interface LocalHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LocalHelpModal({ isOpen, onClose }: LocalHelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 text-left">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-purple-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 font-sans">Sync Folder &amp; Setup Guide</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-700 font-sans text-sm leading-relaxed custom-scrollbar">
          
          {/* Section 1: Intro */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-sm font-bold text-slate-900 block mb-1">How Collaborative Sync Works</span>
            <p className="text-slate-600 mb-3.5">
              This app keeps your team in sync by sharing broadcast calendars and logs through a shared folder on cloud storage or a local office network.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <a
                href="#access-requirements"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Folder settings
              </a>
              <a
                href="#cloud-platforms"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Cloud Services
              </a>
              <a
                href="#office-local"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Office or single PC
              </a>
            </div>
          </div>

          {/* Section 2: Folder Settings & Permissions */}
          <div className="space-y-3" id="access-requirements">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Folder settings</span>
            </h3>
            <p className="text-slate-600">
              Each folder needs the right access settings (note that all three different folders can simply point to the exact same folder if preferred):
            </p>
            <div className="space-y-2">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">1. Calendar Folder (Read &amp; Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Needs full read and write access. This allows managers to adjust the calendar.
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">2. Logs Folder (Read &amp; Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Needs full read and write access. The player continually writes play logs directly to this folder.
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">3. Playback MP3s Folder (Read-Only or Read-Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Can be Read-Only to protect files from accidental deletion, or Read-Write if team members need to upload music from this computer.
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Commercial Cloud Setup & Apps */}
          <div className="space-y-3" id="cloud-platforms">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <HardDrive className="w-4 h-4" />
              <span>Cloud Services</span>
            </h3>
            <p className="text-slate-600">
              These cloud services are common and can be used with your OS.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              {/* Google Drive */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left">
                <div>
                  <strong className="text-slate-900 font-bold block mb-1">Google Drive</strong>
                  <span className="text-slate-600 text-sm block leading-normal mb-3">
                    Choose "Mirror Files" or select "Available Offline" so MP3 files play instantly without streaming lag.
                  </span>
                </div>
                <a
                  href="https://www.google.com/drive/download/"
                  target="_blank"
                  rel="noreferrer referrer"
                  className="mt-auto px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download App</span>
                </a>
              </div>

              {/* OneDrive */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left">
                <div>
                  <strong className="text-slate-900 font-bold block mb-1">Microsoft OneDrive</strong>
                  <span className="text-slate-600 text-sm block leading-normal mb-3">
                    Right-click your folder and choose "Always keep on this device" so files play offline reliably.
                  </span>
                </div>
                <a
                  href="https://www.microsoft.com/microsoft-356/onedrive/download"
                  target="_blank"
                  rel="noreferrer referrer"
                  className="mt-auto px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download App</span>
                </a>
              </div>

              {/* Dropbox */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left">
                <div>
                  <strong className="text-slate-900 font-bold block mb-1">Dropbox</strong>
                  <span className="text-slate-600 text-sm block leading-normal mb-3">
                    Right-click folder assets and choose "Make available offline" to avoid playback delays.
                  </span>
                </div>
                <a
                  href="https://www.dropbox.com/install"
                  target="_blank"
                  rel="noreferrer referrer"
                  className="mt-auto px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download App</span>
                </a>
              </div>
            </div>
          </div>

          {/* Section 4: Local Networks & True Local */}
          <div className="space-y-3" id="office-local">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <Network className="w-4 h-4" />
              <span>Office or single PC</span>
            </h3>
            <div className="space-y-2 text-left">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block mb-0.5">Local Server &amp; Office Networks</strong>
                <p className="text-slate-600">
                  Calendar, MP3s, and logs can reside on mapped office volumes. Ask your network administrator to set up a folder share that mounts on boot.
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block mb-0.5">Single PC (True Local Option)</strong>
                <p className="text-slate-600">
                  Calendar and logs can be stored on your local drive, but they will not sync online or with other team members.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-2.5 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider transition-all cursor-pointer font-sans"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Globe, FileCode, Key, HelpCircle, ExternalLink, Mail, Settings, ShieldAlert, Zap } from 'lucide-react';

interface DriveAuthHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DriveAuthHelpModal({ isOpen, onClose }: DriveAuthHelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-400" />
            <h2 className="text-[13px] font-black uppercase tracking-wider text-slate-100">Google Drive Authorization Guide</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 font-sans text-[12px] leading-relaxed">
          
          {/* Welcome Intro */}
          <div className="space-y-1.5">
            <p>
              This guide explains how the three link methods work in <strong>Interstitial-er</strong> and how to retrieve or set up Google API credentials for secure synchronization across automated broadcast endpoints.
            </p>
          </div>

          <hr className="border-slate-800" />

          {/* Section: Methods */}
          <div className="space-y-4">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>1. Connection Methods Explained</span>
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {/* Option 1 */}
              <div className="bg-slate-950/40 border border-blue-900/20 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-blue-400 font-bold uppercase text-[11.5px]">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Option 1: Autopilot (Local Loopback) — RECOMMENDED RECOMMENDED DEFAULT</span>
                </div>
                <p className="text-slate-450 leading-relaxed">
                  The primary connection standard. Clicking <strong>Connect</strong> opens your web browser to perform the Google login. Once approved, Google redirects back to the app's embedded local port callback (<code className="text-blue-300 font-mono">127.0.0.1:3000/api/oauth-callback</code>). The running application automatically captures the temporary token, applies it to the active player session, and closes the browser tab.
                </p>
                <div className="text-[11px] text-slate-500 font-mono italic">
                  * Note: Once configure steps are set, Option 1 is utilized as the default standard option for regular operation.
                </div>
              </div>

              {/* Option 2 */}
              <div className="bg-slate-950/40 border border-purple-900/20 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-purple-400 font-bold uppercase text-[11.5px]">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Option 2: Browser Verification with Copy-Paste</span>
                </div>
                <p className="text-slate-450 leading-relaxed">
                  Designed as an absolute failsafe for restricted environments. When you click <strong>Get Token from Browser</strong>, you authorize access via Google webpage. On the landing callback page, the screen outputs a secure copyable text string. Paste that string into Interstitial-er and select <strong>Apply</strong>. Bypasses automatic network listener ports.
                </p>
              </div>

              {/* Option 3 */}
              <div className="bg-slate-950/40 border border-emerald-900/20 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase text-[11.5px]">
                  <Key className="w-3.5 h-3.5" />
                  <span>Option 3: Direct Manual Access Token (Bypass)</span>
                </div>
                <p className="text-slate-450 leading-relaxed">
                  Instant developer bypass. Skip browser redirects entirely by supplying any active standard Google Access Token (such as a temporary token generated externally via Google OAuth Playground). Useful for diagnostic scripts or sandbox testing.
                </p>
                <div className="text-[11px] text-slate-500 font-mono italic">
                  * Note: Standard Google Bearer tokens automatically expire after 60 minutes.
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Section: Custom Setup Steps */}
          <div className="space-y-4">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>2. Custom Client ID Provisioning (GCP Setup)</span>
            </h3>

            <p>
              If your organization uses separate API quotas or runs into local testing constraints, you can create a dedicated Client ID directly in Google Cloud.
            </p>

            <div className="space-y-4 text-slate-350">
              {/* Step 1 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-200">Step 1: Create GCP Project & Enable Drive APIs</div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Navigate to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="w-2.5 h-2.5" /></a>.</li>
                  <li>Create a new project (or select your active organization domain).</li>
                  <li>Enable the API library directly at: <a href="https://console.cloud.google.com/apis/library/browse?project=interstitial-er" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-mono">console.cloud.google.com/apis/library/browse?project=interstitial-er</a>. Make sure your project is selected in the top bar, search for <strong>Google Drive API</strong>, and click <strong>Enable</strong>.</li>
                </ol>
              </div>

              {/* Step 2 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-200">Step 2: Setup OAuth Consent Screen</div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Go to <strong>APIs & Services</strong> &gt; <strong>OAuth consent screen</strong>.</li>
                  <li>Select <strong>External</strong> and click <strong>Create</strong>.</li>
                  <li>Fill in mandatory App Details (App Name: `Interstitial-er`, support email, and developer contact email).</li>
                  <li>Save and continue to skipping to the <strong>Test Users</strong> stage.</li>
                </ol>
              </div>

              {/* Step 3 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-200 flex items-center gap-1">
                  <span>Step 3: Whitelisting authorized emails &amp; Testing Accounts</span>
                  <ShieldAlert className="w-3 h-3 text-amber-500" />
                </div>
                <p className="pl-4 mb-1">
                  Until your OAuth credentials are brand-verified by Google, your client sits in "Testing Mode". Only designated accounts can authenticate.
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>In the consent screen config, navigate to the <strong>Test users</strong> panel.</li>
                  <li>Click <strong>+ ADD USERS</strong> and insert the exact GMail or Google Workspace account addresses.</li>
                  <li>Save changes to allow authorization bypass warnings.</li>
                </ol>

                <div className="mt-2.5 p-3 bg-blue-950/20 border border-blue-900/30 rounded-lg space-y-1.5 pl-4">
                  <div className="font-bold text-blue-300 flex items-center gap-1 text-[11.5px] uppercase">
                    <Mail className="w-3 h-3" />
                    <span>Recommended Org Practice</span>
                  </div>
                  <p className="text-slate-400">
                    To automate deployments smoothly and avoid adding multiple staff emails: set up <strong>one unified functional Google Account</strong> (e.g., <code className="bg-slate-950 px-1 py-0.5 rounded font-mono">broadcast-drive@company.org</code>). Grant this address read/write folder shares to your media, whitelist just this account in GCP test users, and utilize it across all player locations.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-200">Step 4: Create Desktop Credentials</div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Click <strong>APIs & Services</strong> &gt; <strong>Credentials</strong>.</li>
                  <li>Select <strong>+ CREATE CREDENTIALS</strong> &gt; <strong>OAuth client ID</strong>.</li>
                  <li>Set <strong>Application type</strong> to <strong>Desktop app</strong>.</li>
                  <li>Submit, and copy the calculated <strong>Client ID</strong> (the long string ending with <code className="bg-slate-950 px-1 rounded text-emerald-400">.apps.googleusercontent.com</code>).</li>
                </ol>
              </div>
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Section: Settings Config */}
          <div className="space-y-1.5 p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
            <span className="text-[11px] font-black uppercase tracking-wider block text-slate-200">Applying Custom Settings</span>
            <p className="text-slate-400 leading-normal">
              Open the <strong>Advanced connection options</strong> bar in Google settings dashboard, input your new Client ID into the core text slot, and click Connect inside the primary card. Your secure desktop endpoints will now validate against your designated company console credentials.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-slate-800 bg-slate-950/20 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-[11.5px] font-black uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-all cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}

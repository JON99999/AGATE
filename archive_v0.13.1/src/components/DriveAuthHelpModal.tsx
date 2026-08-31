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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Google Drive Authorization Guide</h2>
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
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 font-sans text-xs leading-relaxed custom-scrollbar">
          
          {/* Welcome Intro */}
          <div className="space-y-1.5">
            <p>
              This guide explains how the connection methods work in <strong>WIPE (Wonderful Interstitial PlayEr)</strong> and how to retrieve or set up Google API credentials for secure synchronization across automated broadcast endpoints.
            </p>
          </div>

          <hr className="border-slate-200" />

          {/* Section: Methods */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>1. Connection Methods Explained</span>
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {/* Option: Preapproved */}
              <div className="bg-slate-50/80 border border-blue-200/60 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-blue-600 font-bold uppercase text-xs">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Option: Preapproved (Pop-up login using OAUTH Client ID)</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  With an OAUTH Client ID, WIPE opens a pop-up login window. Google user email must be preapproved in that Client ID in Google OAUTH. See your admin to be added.
                </p>
                <div className="text-xs text-slate-500 font-mono italic">
                  * Note: Once configured, this is utilized as the primary, default standard connection for regular operation.
                </div>
              </div>

              {/* Option: Access Token */}
              <div className="bg-slate-50/80 border border-emerald-200/60 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-600 font-bold uppercase text-xs">
                  <Key className="w-3.5 h-3.5" />
                  <span>Option: Access Token (Direct Bypass)</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Instant developer bypass. Skip browser redirects entirely by supplying any active standard Google Access Token (such as a temporary token generated externally via Google OAuth Playground). Useful for diagnostic scripts or sandbox testing.
                </p>
                
                <div className="p-3 bg-white border border-emerald-200 rounded-md space-y-2 text-xs">
                  <div className="font-bold text-slate-900">How to get a token using Google OAuth Playground:</div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-slate-700">
                    <li>Navigate to the <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">Google OAuth Playground <ExternalLink className="w-2.5 h-2.5" /></a>.</li>
                    <li>Under Step 1 "Select &amp; authorize APIs," type <code className="bg-slate-100 border border-slate-300 px-1 py-0.2 rounded font-mono text-emerald-700">https://www.googleapis.com/auth/drive</code> into the input bar and click <strong>Authorize APIs</strong>.</li>
                    <li>Sufficiently authorize via your Google account.</li>
                    <li>On Step 2 in the playground, click the <strong>Exchange authorization code for tokens</strong> button.</li>
                    <li>Copy the <strong>Access Token</strong> value from the input/details panel (this is the <code className="text-emerald-700 font-mono">access_token</code> value).</li>
                    <li>Open WIPE settings, expand Advanced options, select Option: Access Token, paste the access_token value, and click <strong>Connect</strong>.</li>
                  </ol>
                </div>

                <div className="text-xs text-slate-500 font-mono italic">
                  * Note: Standard Google Bearer tokens automatically expire after 60 minutes.
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Subsection: Original Commented Out Method */}
          <div className="space-y-3 bg-slate-50/80 border border-slate-200 p-4 rounded-lg">
            <h4 className="text-xs font-black uppercase tracking-wider text-purple-600 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5" />
              <span>Sub Section: Commented Out / Untested Connection Option</span>
            </h4>
            <div className="text-slate-600 leading-relaxed text-xs space-y-1">
              <p className="font-bold text-slate-900">Untested Option: Browser Verification with Copy-Paste (Failsafe)</p>
              <p>
                Designed as an absolute failsafe for restricted environments. Selecting this launches Google auth in your browser, then redirects to a static page where your authorization string is displayed. You copy that string and paste it into the application to configure.
              </p>
            </div>
            <div className="text-xs text-amber-700 font-sans italic">
              * Note: This method is currently disabled/commented-out in the configuration interface. Future developers might want to try to implement the "Untested Option" in code.
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Section: Custom Setup Steps */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>2. Custom Client ID Provisioning (GCP Setup)</span>
            </h3>

            <p>
              If your organization uses separate API quotas or runs into local testing constraints, you can create a dedicated Client ID directly in Google Cloud.
            </p>

            <div className="space-y-4 text-slate-700">
              {/* Step 1 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-900">Step 1: Create GCP Project & Enable Drive APIs</div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Navigate to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="w-2.5 h-2.5" /></a>.</li>
                  <li>Create a new project (or select your active organization domain).</li>
                  <li>Enable the API library directly at: <a href="https://console.cloud.google.com/apis/library/browse?project=interstitial-er" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-mono">console.cloud.google.com/apis/library/browse?project=interstitial-er</a>. Make sure your project is selected in the top bar, search for <strong>Google Drive API</strong>, and click <strong>Enable</strong>.</li>
                </ol>
              </div>

              {/* Step 2 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-900">Step 2: Setup OAuth Consent Screen</div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Go to <strong>APIs & Services</strong> &gt; <strong>OAuth consent screen</strong>.</li>
                  <li>Select <strong>External</strong> and click <strong>Create</strong>.</li>
                  <li>Fill in mandatory App Details (App Name: `WIPE`, support email, and developer contact email).</li>
                  <li>Save and continue to skipping to the <strong>Test Users</strong> stage.</li>
                </ol>
              </div>

              {/* Step 3 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <span>Step 3: Whitelisting authorized emails &amp; Testing Accounts</span>
                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                </div>
                <p className="pl-4 mb-1">
                  Until your OAuth credentials are brand-verified by Google, your client sits in "Testing Mode". Only designated accounts can authenticate.
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>In the consent screen config, navigate to the <strong>Test users</strong> panel.</li>
                  <li>Click <strong>+ ADD USERS</strong> and insert the exact GMail or Google Workspace account addresses.</li>
                  <li>Save changes to allow authorization bypass warnings.</li>
                </ol>

                <div className="mt-2.5 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5 pl-4">
                  <div className="font-bold text-blue-700 flex items-center gap-1 text-xs uppercase">
                    <Mail className="w-3 h-3" />
                    <span>Recommended Org Practice</span>
                  </div>
                  <p className="text-slate-600">
                    To automate deployments smoothly and avoid adding multiple staff emails: set up <strong>one unified functional Google Account</strong> (e.g., <code className="bg-slate-100 border border-slate-300 px-1 py-0.5 rounded font-mono">broadcast-drive@company.org</code>). Grant this address read/write folder shares to your media, whitelist just this account in GCP test users, and utilize it across all player locations.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-1">
                <div className="font-bold text-slate-900">Step 4: Create Desktop Credentials</div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Click <strong>APIs & Services</strong> &gt; <strong>Credentials</strong>.</li>
                  <li>Select <strong>+ CREATE CREDENTIALS</strong> &gt; <strong>OAuth client ID</strong>.</li>
                  <li>Set <strong>Application type</strong> to <strong>Desktop app</strong>.</li>
                  <li>Submit, and copy the calculated <strong>Client ID</strong> (the long string ending with <code className="bg-slate-100 border border-slate-300 px-1 rounded text-emerald-700">.apps.googleusercontent.com</code>).</li>
                </ol>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Section: Settings Config */}
          <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-xs font-black uppercase tracking-wider block text-slate-900">Applying Custom Settings</span>
            <p className="text-slate-600 leading-normal">
              Open the <strong>Advanced connection options</strong> bar in Google settings dashboard, input your new Client ID into the core text slot, and click Connect inside the primary card. Your secure desktop endpoints will now validate against your designated company console credentials.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded transition-all cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}

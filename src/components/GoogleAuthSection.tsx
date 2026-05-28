/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Globe, Key, FileCode, CheckCircle, AlertCircle, RefreshCw, LogOut, Copy, ExternalLink, ShieldCheck, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import DriveAuthHelpModal from './DriveAuthHelpModal';

interface GoogleAuthSectionProps {
  user: any;
  token: string | null;
  setToken: (token: string | null) => void;
  setUser: (user: any) => void;
  googleClientId: string;
  setGoogleClientId: (id: string) => void;
  isPollingExternal: boolean;
  setIsPollingExternal: (polling: boolean) => void;
  setIsValidatingDrive: (validating: boolean) => void;
  setLoading: (loading: boolean) => void;
  setDriveValidationError: (error: string | null) => void;
  driveValidationError: string | null;
  validateGoogleDriveAccess: () => Promise<boolean>;
  fetchDataForMode: (settings?: any) => Promise<void>;
  handleAuthSignOut: () => Promise<void>;
  setOverrideAccessToken: (token: string | null) => void;
}

export default function GoogleAuthSection({
  user,
  token,
  setToken,
  setUser,
  googleClientId,
  setGoogleClientId,
  isPollingExternal,
  setIsPollingExternal,
  setIsValidatingDrive,
  setLoading,
  setDriveValidationError,
  driveValidationError,
  validateGoogleDriveAccess,
  fetchDataForMode,
  handleAuthSignOut,
  setOverrideAccessToken,
}: GoogleAuthSectionProps) {
  const [activeTab, setActiveTab] = useState<'autopilot' | 'manual-transfer' | 'direct-token'>('autopilot');
  const [copied, setCopied] = useState(false);
  const [manualCodeToken, setManualCodeToken] = useState('');
  const [localManualToken, setLocalManualToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // Auto-open Advanced options and select Option 3 when running in AI Studio and not authenticated
  useEffect(() => {
    const hostname = window.location.hostname;
    const isAIStudio = hostname.includes('.run.app') || 
                      hostname.includes('aistudio') || 
                      hostname.includes('googleusercontent.com');
    if (isAIStudio && !token) {
      setShowAdvanced(true);
      setActiveTab('direct-token');
    }
  }, [token]);

  // Save the Client ID and selected method when modified
  const handleClientIdChange = (id: string) => {
    setGoogleClientId(id);
    localStorage.setItem('interstitialer_google_client_id', id.trim());
  };

  // Helper to construct the OAuth login URL
  const getOAuthUrl = () => {
    const port = window.location.port || '3000';
    const redirectUri = `http://127.0.0.1:${port}/api/oauth-callback`;
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=https://www.googleapis.com/auth/drive`;
  };

  // Option 1: Desktop Browser Loopback (Auto Callback)
  const handleLaunchAutopilot = async () => {
    if (!googleClientId.trim()) {
      setDriveValidationError('A Google OAuth Client ID is required to launch browser authentication.');
      return;
    }
    
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      setIsPollingExternal(true);

      const authUrl = getOAuthUrl();
      console.log('Launching external browser for Google OAuth Option 1 (Loopback):', authUrl);
      window.open(authUrl, '_blank');

      // Start looping and checking for token
      let pollCount = 0;
      const intervalId = setInterval(async () => {
        pollCount++;
        if (pollCount > 300) { // 5 minutes timeout
          clearInterval(intervalId);
          setIsPollingExternal(false);
          setIsValidatingDrive(false);
          setLoading(false);
          setDriveValidationError('Autopilot connection timed out. Verify your local server is reachable.');
          return;
        }

        try {
          const res = await fetch('/api/check-registered-token');
          if (!res.ok) throw new Error('Unreachable loopback callback');
          const data = await res.json();
          if (data.token) {
            clearInterval(intervalId);
            setIsPollingExternal(false);
            
            // Set token and retrieve user details
            setOverrideAccessToken(data.token);
            setToken(data.token);
            
            // Fetch Google Profile details
            const userProfile = await fetchGoogleUserInfo(data.token);
            const userObj = userProfile || { email: 'authorized-device@interstitialer.local', displayName: 'Loopback Verified Session' };
            setUser(userObj);
            localStorage.setItem('interstitialer_user_profile', JSON.stringify(userObj));
            
            // Validate Folder access
            const success = await validateGoogleDriveAccess();
            if (success) {
              setDriveValidationError(null);
              // Save updated state variables
              const { getSavedSettings } = await import('../lib/driveService');
              const currentSettings = getSavedSettings();
              await fetchDataForMode(currentSettings);
            } else {
              setDriveValidationError('OAuth Token verified, but Google API rejected direct access. Check shared parameters.');
            }
            setIsValidatingDrive(false);
            setLoading(false);
          }
        } catch (err) {
          console.warn('Loopback checker poll warning:', err);
        }
      }, 1000);

    } catch (e: any) {
      console.error('Option 1 OAuth launch failed:', e);
      setDriveValidationError(e.message || 'Failed to initialize external browser flow.');
      setIsValidatingDrive(false);
      setIsPollingExternal(false);
      setLoading(false);
    }
  };

  // Option 2: Copy-Paste OAuth Helper (Manual Redirection)
  const handleLaunchManualHelper = () => {
    if (!googleClientId.trim()) {
      setDriveValidationError('A Google OAuth Client ID is required to generate the authentication consent link.');
      return;
    }
    const authUrl = getOAuthUrl();
    console.log('Opening OAuth Helper URL:', authUrl);
    window.open(authUrl, '_blank');
  };

  const handleApplyManualHelperToken = async () => {
    if (!manualCodeToken.trim()) {
      setDriveValidationError('Please paste your Google Access Token to apply.');
      return;
    }
    await applyGenericToken(manualCodeToken.trim(), 'Manual Copy-Paste Verification');
  };

  // Option 3: Direct Manual Access Token (Instant Bypass)
  const handleApplyDirectToken = async () => {
    if (!localManualToken.trim()) {
      setDriveValidationError('An active Google Access Token is required.');
      return;
    }
    await applyGenericToken(localManualToken.trim(), 'Direct Token Injection');
  };

  // Shared token application routines
  const applyGenericToken = async (inputToken: string, sessionLabel: string) => {
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      
      setOverrideAccessToken(inputToken);
      setToken(inputToken);

      // Verify and download user profile
      const userProfile = await fetchGoogleUserInfo(inputToken);
      const userObj = userProfile || { email: 'manual-session@interstitialer.local', displayName: sessionLabel };
      setUser(userObj);
      localStorage.setItem('interstitialer_user_profile', JSON.stringify(userObj));

      // Verify Google Drive directories using the token
      const success = await validateGoogleDriveAccess();
      if (success) {
        setDriveValidationError(null);
        const { getSavedSettings } = await import('../lib/driveService');
        const currentSettings = getSavedSettings();
        await fetchDataForMode(currentSettings);
      } else {
        setDriveValidationError('Token applied, but Google API rejected access. Check if token expired or lacks Drive read/write permissions.');
      }
    } catch (e: any) {
      console.error('Token verification failed:', e);
      setDriveValidationError(e.message || 'Failed to apply and verify the Google OAuth token.');
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  // Fetch helper for user profiles directly using google OAuth token
  const fetchGoogleUserInfo = async (accessTokenValue: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessTokenValue}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        return {
          email: data.email || 'authorized-device@interstitialer.local',
          displayName: data.name || 'Authorized User'
        };
      }
      
      // Fallback
      const driveAboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${accessTokenValue}`
        }
      });
      if (driveAboutRes.ok) {
        const data = await driveAboutRes.json();
        if (data.user) {
          return {
            email: data.user.emailAddress || 'authorized-device@interstitialer.local',
            displayName: data.user.displayName || 'Authorized User'
          };
        }
      }
      return null;
    } catch (e) {
      console.warn('Google profile fetch skipped:', e);
      return null;
    }
  };

  // Utility to handle copying the loopback URI helper configuration
  const handleCopyLoopbackUri = () => {
    const port = window.location.port || '3000';
    const loopUri = `http://127.0.0.1:${port}/api/oauth-callback`;
    navigator.clipboard.writeText(loopUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pt-2 border-t border-slate-800 mt-3 space-y-3">
      {/* Account Linked Header Status */}
      <div className={cn(
        "p-3 rounded-lg flex flex-col gap-2 transition-all duration-200 border",
        user 
          ? (driveValidationError ? "bg-slate-950/40 border-orange-500/20" : "bg-slate-950/40 border-emerald-500/20")
          : "bg-slate-950/20 border-slate-850"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className={cn("w-3.5 h-3.5", user ? (driveValidationError ? "text-orange-400" : "text-emerald-400") : "text-slate-500")} />
            <span className="text-[14px] font-black uppercase tracking-wider text-slate-400">Google Drive Status</span>
          </div>
          {user ? (
            driveValidationError ? (
              <span className="text-[16px] bg-orange-950/30 text-orange-400 border border-orange-900/40 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Disconnect and retry</span>
            ) : (
              <span className="text-[16px] bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Authenticated</span>
            )
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleLaunchAutopilot}
                disabled={isPollingExternal || !googleClientId.trim()}
                className="py-0.5 px-2 text-[14px] font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 disabled:bg-slate-850 disabled:text-slate-500 text-white border border-blue-550 rounded transition-colors duration-150 flex items-center gap-1 cursor-pointer shrink-0"
              >
                {isPollingExternal ? (
                  <>
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Connect</span>
                )}
              </button>
              <span className="text-[16px] bg-red-950/20 text-red-400 border border-red-955 px-1.5 py-0.5 rounded font-black uppercase tracking-wider animate-pulse">Disconnected</span>
            </div>
          )}
        </div>

        {user ? (
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-mono text-slate-200 truncate">{user.email}</p>
                {token && (
                  <p className="text-[14px] font-mono text-slate-500 mt-0.5">Token: {token.substring(0, 10)}...{token.substring(token.length - 10)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleAuthSignOut}
                className="py-1 px-2.5 text-[16px] font-black bg-red-950/25 text-red-400 border border-red-900/40 hover:bg-red-900 hover:text-white rounded transition-colors duration-150 uppercase tracking-wider cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[14px] font-sans text-slate-400 leading-normal">
            Connect to Google Drive.
          </p>
        )}
      </div>

      {/* Auth Tab Picker */}
      {!user && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between bg-slate-950/20 border border-slate-850 rounded-lg px-2.5 py-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[12px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-1"
            >
              <span className="text-[14px] text-blue-500">{showAdvanced ? "▼" : "▶"}</span>
              <span>Advanced connection options</span>
            </button>
            {showAdvanced && (
              <button
                type="button"
                onClick={() => setIsHelpOpen(true)}
                className="text-[12px] font-black uppercase tracking-wider text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1 bg-blue-950/20 border border-blue-900/30 px-2 py-0.5 rounded transition-all shrink-0"
              >
                <HelpCircle className="w-2.5 h-2.5" />
                <span>Help</span>
              </button>
            )}
          </div>

          {showAdvanced && (
            <div className="space-y-2.5 border-t border-slate-850 pt-2.5">
              <div className="flex border-b border-slate-800 p-0.5 bg-slate-950/40 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveTab('autopilot')}
                  className={cn(
                    "flex-1 py-1 text-[14px] font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                    activeTab === 'autopilot' 
                      ? "bg-blue-600/15 text-blue-400 border border-blue-500/25" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Option: Preapproved
                </button>
                {/*
                <button
                  type="button"
                  onClick={() => setActiveTab('manual-transfer')}
                  className={cn(
                    "flex-1 py-1 text-[14px] font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                    activeTab === 'manual-transfer' 
                      ? "bg-blue-600/15 text-blue-400 border border-blue-500/25" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Untested Option: Copy-Paste
                </button>
                */}
                <button
                  type="button"
                  onClick={() => setActiveTab('direct-token')}
                  className={cn(
                    "flex-1 py-1 text-[14px] font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                    activeTab === 'direct-token' 
                      ? "bg-blue-600/15 text-blue-400 border border-blue-500/25" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Option: Access Token
                </button>
              </div>

              <div className="min-h-[140px] flex flex-col justify-between bg-slate-950/20 border border-slate-850 rounded-xl p-3">
                {/* Tab Details */}
                <AnimatePresence mode="wait">
                  {activeTab === 'autopilot' && (
                    <motion.div
                      key="autopilot"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <div className="flex items-start gap-1.5 text-blue-400">
                        <Globe className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <span className="text-[12px] font-black uppercase tracking-wider block">Option: Login using OAUTH client ID</span>
                          <p className="text-[12px] text-slate-400 leading-relaxed font-sans">
                            With a OAUTH Client ID, Interstitial-er opens a pop-up login window.  Google user email must be preapproved in that Client ID in Google OAUTH.  See your admin to be added.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded">
                        <label className="text-[12px] text-slate-400 block font-black uppercase tracking-wider">Google OAuth Client ID</label>
                        <input
                          type="text"
                          placeholder="Paste google_client_id here..."
                          value={googleClientId}
                          onChange={(e) => handleClientIdChange(e.target.value)}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[14px] font-mono text-slate-200 outline-none"
                        />
                      </div>

                      <div className="flex flex-col gap-2 pt-1 border-t border-slate-900">
                        <button
                          type="button"
                          onClick={handleLaunchAutopilot}
                          disabled={isPollingExternal || !googleClientId.trim()}
                          className="w-full py-1 text-[14px] font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 disabled:bg-slate-850 disabled:text-slate-500 text-white rounded transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {isPollingExternal ? (
                            <>
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              <span>Polling Local Port Callback...</span>
                            </>
                          ) : (
                            <span>Login</span>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'manual-transfer' && (
                    <motion.div
                      key="manual-transfer"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <div className="flex items-start gap-1.5 text-blue-400">
                        <FileCode className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <span className="text-[12px] font-black uppercase tracking-wider block">Untested Option: Browser Verification with Copy-Paste</span>
                          <p className="text-[12px] text-slate-400 leading-relaxed font-sans">
                            Failsafe method for restricted machines. Launches Google auth, redirects to a page where your token is displayed. Copy and paste it here.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded">
                        <label className="text-[12px] text-slate-400 block font-black uppercase tracking-wider">Google OAuth Client ID</label>
                        <input
                           type="text"
                          placeholder="Paste google_client_id here..."
                          value={googleClientId}
                          onChange={(e) => handleClientIdChange(e.target.value)}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[14px] font-mono text-slate-200 outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-[1fr_auto] gap-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded">
                        <div className="space-y-1">
                          <label className="text-[12px] text-slate-400 block font-black uppercase tracking-wider">Paste Authorized Access Token</label>
                          <input
                            type="password"
                            placeholder="Paste verification token here (Bearer)..."
                            value={manualCodeToken}
                            onChange={(e) => setManualCodeToken(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[14px] font-mono text-slate-250 outline-none"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <button
                            type="button"
                            onClick={handleApplyManualHelperToken}
                            className="px-2.5 py-1 text-[14px] font-black bg-blue-600 hover:bg-blue-500 text-white rounded uppercase tracking-wider transition cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleLaunchManualHelper}
                        disabled={!googleClientId.trim()}
                        className="w-full py-1 text-[14px] font-black uppercase tracking-wider bg-slate-805 hover:bg-slate-750 text-slate-200 border border-slate-705 rounded transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>1. Get Token from Browser</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>

                      <div className="text-[11px] text-amber-550 italic font-mono leading-relaxed pt-1 bg-amber-950/10 border border-amber-900/20 rounded p-2">
                        * Note: Future developers might want to try to implement the "Untested Option" in code.
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'direct-token' && (
                    <motion.div
                      key="direct-token"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <div className="flex items-start gap-1.5 text-blue-400">
                        <Key className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <span className="text-[14px] font-black uppercase tracking-wider block">Option: Direct Access Token</span>
                          <p className="text-[14px] text-slate-400 leading-relaxed font-sans font-medium">
                            {"Uses Google OAuth Playground.  To obtain \"Access Token\".  Open 'Drive API v3'. Check 'https://www.googleapis.com/auth/drive'.  Click 'Authorize APIs'.  Log in.  Click 'Exchange authorization code for tokens'.  Copy the text of the \"access_token\".  Paste below."}
                          </p>
                          <div className="pt-1.5 select-text">
                            <a
                              href="https://developers.google.com/oauthplayground"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[14px] text-blue-400 hover:text-blue-300 font-bold inline-flex items-center gap-1 underline cursor-pointer break-all"
                            >
                              <span>Click here to start</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_auto] gap-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded">
                        <div className="space-y-1">
                          <label className="text-[14px] text-slate-400 block font-black uppercase tracking-wider">access_token value</label>
                          <input
                            type="password"
                            placeholder="Paste raw oauth access token here..."
                            value={localManualToken}
                            onChange={(e) => setLocalManualToken(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[16px] font-mono text-slate-250 outline-none"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <button
                            type="button"
                            onClick={handleApplyDirectToken}
                            className="px-2.5 py-1 text-[16px] font-black bg-blue-600 hover:bg-blue-500 text-white rounded uppercase tracking-wider transition cursor-pointer"
                          >
                            Connect
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      <DriveAuthHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Shared Diagnostic Warning Streams */}
      {driveValidationError && (
        <div className="p-3.5 bg-red-955/15 border border-red-900/40 rounded-lg text-[16px] text-red-300 space-y-2 max-w-full">
          <button
            type="button"
            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
            className="flex items-center gap-1.5 font-bold uppercase text-red-400 text-[14px] cursor-pointer text-left focus:outline-none"
          >
            <span className="text-[14px] text-red-500 shrink-0">{showTroubleshooting ? "▼" : "▶"}</span>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Troubleshooting notes</span>
          </button>
          
          {showTroubleshooting && (
            <div className="space-y-2 pt-2 border-t border-red-900/25">
              <p className="font-sans leading-relaxed text-slate-300 text-[14px]">
                The authorization sequence returned an issue:
              </p>
              <div className="p-1 px-2 bg-slate-950 rounded border border-slate-800 font-mono text-[14px] text-slate-450 select-all overflow-x-auto whitespace-pre block max-w-full">
                {driveValidationError}
              </div>
              <ul className="list-disc pl-3.5 space-y-1 text-slate-400 text-[14px] leading-relaxed">
                <li>
                  <strong className="text-slate-350">GCP Redirect Restrictions:</strong> Google tightly restricts redirects of custom protocols or localhost. Verify client credentials.
                </li>
                <li>
                  <strong className="text-slate-350">Authorized Origins Check:</strong> Confirm that <code className="bg-slate-900 border border-slate-800 px-1 py-0.2 rounded font-mono select-all text-[14px]">{window.location.origin}</code> and loopbacks are whitelisted in your Google Cloud platform credentials settings.
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

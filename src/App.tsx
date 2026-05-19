/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Calendar, Clock, List, Settings, Plus, Play, CheckCircle, AlertCircle, RefreshCw, LogOut, ChevronLeft, ChevronRight, Save, Trash2, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addHours, subHours, isSameMinute, startOfHour, addMinutes, isAfter, isBefore, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Schedule, ScheduleType, LogEntry } from './types';
import PlayerTab from './components/PlayerTab';
import SchedulerTab from './components/SchedulerTab';
import LogTab from './components/LogTab';
import { cn } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'player' | 'scheduler' | 'log'>('player');
  const [isAdmin, setIsAdmin] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [syncTime, setSyncTime] = useState(new Date());
  const [countdown, setCountdown] = useState(300);
  const [scrollTrigger, setScrollTrigger] = useState(0);

  const fetchData = async () => {
    try {
      const [schedulesRes, logsRes] = await Promise.all([
        fetch('/api/schedules'),
        fetch('/api/logs')
      ]);
      const schedulesData = await schedulesRes.json();
      const logsData = await logsRes.json();
      setSchedules(schedulesData);
      setLogs(logsData);
      setSyncTime(new Date());
      // Increment trigger after data is fetched to ensure list is ready
      setScrollTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData();
    setCountdown(300);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sync Timer Logic
  useEffect(() => {
    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);
      setCountdown(prev => {
        if (prev <= 1) {
          fetchData();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const saveSchedules = async (newSchedules: Schedule[]) => {
    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSchedules)
      });
      setSchedules(newSchedules);
    } catch (error) {
      console.error('Failed to save schedules:', error);
    }
  };

  const addLog = async (entry: LogEntry) => {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      setLogs(prev => [...prev, entry]);
    } catch (error) {
      console.error('Failed to add log:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Top Header - Branding & Nav */}
      <header className="bg-[#0F172A] px-3 py-2 shrink-0 z-20">
        <div className="flex items-center justify-between gap-3 max-w-[400px] mx-auto">
          <div className="flex items-center gap-2 text-white">
            <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <span className="font-bold text-xs tracking-tight">Interstitial-er</span>
          </div>
          <div className="flex gap-1">
            <button
               onClick={() => setActiveTab('player')}
               className={cn(
                 "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                 activeTab === 'player' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
               )}
            >
              <Play className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Player</span>
            </button>
            <button
               onClick={() => setActiveTab('scheduler')}
               className={cn(
                 "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                 activeTab === 'scheduler' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
               )}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Scheduler</span>
            </button>
            <button
               onClick={() => setActiveTab('log')}
               className={cn(
                 "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                 activeTab === 'log' ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
               )}
            >
              <History className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Log</span>
            </button>
          </div>
        </div>
      </header>

      {/* Control Strip - Time & Refresh (Collapsed) */}
      <div className="bg-white border-b border-slate-200 py-1.5 px-2 shrink-0 shadow-sm z-10">
        <div className="max-w-[400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <p className="text-[9px] uppercase text-slate-400 font-black tracking-tighter">Current Time</p>
            <p className="text-sm font-mono font-black text-slate-900 tabular-nums leading-none">{format(now, 'HH:mm:ss')}</p>
          </div>
          
          <div className="flex items-center gap-2">
            <p className="text-[8px] uppercase text-blue-600 font-black tracking-tight leading-none whitespace-nowrap">{formatCountdown(countdown)} UNTIL AUTO-REFRESH</p>
            <button 
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors group"
              title="Reload Status"
            >
              <RefreshCw className="w-3 h-3 font-bold group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-[9px] font-black uppercase tracking-tighter">Refresh now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#F8FAFC] pb-2">
        <div className={cn(
          "w-full mx-auto px-1 pt-3 h-full",
          activeTab === 'player' ? "max-w-[200px]" : "max-w-[1000px]"
        )}>
          <AnimatePresence mode="wait">
            {activeTab === 'player' ? (
              <motion.div
                key="player"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <PlayerTab 
                  schedules={schedules} 
                  logs={logs} 
                  onLog={addLog}
                  now={now}
                  syncTime={syncTime}
                  scrollTrigger={scrollTrigger}
                />
              </motion.div>
            ) : activeTab === 'scheduler' ? (
              <motion.div
                key="scheduler"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <SchedulerTab 
                  schedules={schedules} 
                  onSave={saveSchedules}
                  isAdmin={isAdmin}
                  onAdminToggle={setIsAdmin}
                  now={now}
                />
              </motion.div>
            ) : (
              <motion.div
                key="log"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <LogTab logs={logs} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Footer - Status Info */}
      <footer className="bg-slate-900 px-4 py-2 shrink-0 border-t border-slate-800">
        <div className="max-w-[180px] mx-auto flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase tracking-widest">
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              <span>System: ON</span>
           </div>
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
              <span>Storage: OK</span>
           </div>
        </div>
      </footer>
    </div>
  );
}


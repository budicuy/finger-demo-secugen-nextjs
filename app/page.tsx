'use client';

import React, { useState, useEffect } from 'react';
import { Fingerprint, UserPlus, CheckCircle, AlertCircle, Trash2, Scan, Users, Shield, Activity, Database } from 'lucide-react';

interface User {
  id: number;
  name: string;
  template: string;
  enrollDate: string;
}

interface CapturedData {
  template: string;
  image: string;
  quality: number;
  nfiq: number;
}

export default function FingerprintSystem() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastCaptured, setLastCaptured] = useState<CapturedData | null>(null);
  const [activeTab, setActiveTab] = useState<'enroll' | 'verify'>('enroll');
  const [storageStatus, setStorageStatus] = useState<'idle' | 'saving' | 'loading' | 'error'>('idle');

  // Load users from localStorage on component mount
  useEffect(() => {
    loadUsersFromStorage();
  }, []);

  // Save users to localStorage whenever they change
  useEffect(() => {
    if (users.length > 0 || storageStatus === 'idle') {
      saveUsersToStorage();
    }
  }, [users]);

  const loadUsersFromStorage = () => {
    try {
      setStorageStatus('loading');
      const storedUsers = localStorage.getItem('fingerprintUsers');
      if (storedUsers) {
        const parsedUsers = JSON.parse(storedUsers);
        setUsers(parsedUsers);
        setMessage(`Berhasil memuat ${parsedUsers.length} user dari penyimpanan lokal`);
      }
      setStorageStatus('idle');
    } catch (error) {
      console.error('Error loading users from storage:', error);
      setMessage('Gagal memuat data dari penyimpanan lokal');
      setStorageStatus('error');
    }
  };

  const saveUsersToStorage = () => {
    try {
      setStorageStatus('saving');
      localStorage.setItem('fingerprintUsers', JSON.stringify(users));
      setStorageStatus('idle');
    } catch (error) {
      console.error('Error saving users to storage:', error);
      setMessage('Gagal menyimpan data ke penyimpanan lokal. Ruang penyimpanan mungkin penuh.');
      setStorageStatus('error');
    }
  };

  const captureFingerprint = async (): Promise<string | null> => {
    setIsCapturing(true);
    setMessage('Menangkap sidik jari...');

    try {
      const params = new URLSearchParams({
        Timeout: '10000',
        Quality: '80',
        licstr: '',
        templateFormat: 'ISO',
        imageWSQRate: '0.75'
      });

      const response = await fetch('https://localhost:8443/SGIFPCapture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.ErrorCode === 0) {
        const capturedData = {
          template: data.TemplateBase64,
          image: data.BMPBase64,
          quality: data.ImageQuality,
          nfiq: data.NFIQ
        };

        setLastCaptured(capturedData);

        // Save last captured to localStorage
        try {
          localStorage.setItem('lastCaptured', JSON.stringify(capturedData));
        } catch (error) {
          console.error('Error saving last captured:', error);
        }

        setMessage(`Sidik jari berhasil ditangkap! Kualitas: ${data.ImageQuality}, NFIQ: ${data.NFIQ}`);
        return data.TemplateBase64;
      } else {
        setMessage(`Error: ${data.ErrorCode} - ${getErrorDescription(data.ErrorCode)}`);
        return null;
      }
    } catch (error) {
      const err = error as Error;
      setMessage(`Error koneksi: ${err.message}. Pastikan SGIBIOSRV berjalan di port 8443`);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const getErrorDescription = (code: number): string => {
    const errors: Record<number, string> = {
      51: 'System file load failure',
      52: 'Sensor chip initialization failed',
      53: 'Device not found',
      54: 'Fingerprint image capture timeout',
      55: 'No device available',
      56: 'Driver load failed',
      57: 'Wrong Image',
      58: 'Lack of bandwidth',
      59: 'Device Busy',
      60: 'Cannot get serial number',
      61: 'Unsupported device',
      63: 'SgiBioSrv tidak berjalan'
    };
    return errors[code] || 'Unknown error';
  };

  const enrollUser = async () => {
    if (!name.trim()) {
      setMessage('Nama harus diisi!');
      return;
    }

    const template = await captureFingerprint();
    if (template) {
      const newUser: User = {
        id: Date.now(),
        name: name.trim(),
        template: template,
        enrollDate: new Date().toLocaleString('id-ID')
      };

      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);

      // Explicitly save to localStorage
      try {
        localStorage.setItem('fingerprintUsers', JSON.stringify(updatedUsers));
        setMessage(`${name} berhasil didaftarkan dan disimpan!`);
      } catch (error) {
        setMessage(`${name} berhasil didaftarkan, tetapi gagal menyimpan ke penyimpanan lokal`);
      }

      setName('');
    }
  };

  const verifyFingerprint = async () => {
    if (users.length === 0) {
      setMessage('Belum ada user terdaftar!');
      return;
    }

    const template = await captureFingerprint();
    if (!template) return;

    setMessage('Memverifikasi...');
    let bestMatch: User | null = null;
    let bestScore = 0;

    for (const user of users) {
      try {
        const params = new URLSearchParams({
          Template1: template,
          Template2: user.template,
          licstr: '',
          templateFormat: 'ISO'
        });

        const response = await fetch('https://localhost:8443/SGIMatchScore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString()
        });

        const data = await response.json();

        if (data.ErrorCode === 0 && data.MatchingScore > bestScore) {
          bestScore = data.MatchingScore;
          bestMatch = user;
        }
      } catch (error) {
        const err = error as Error;
        setMessage(`Error matching: ${err.message}`);
        return;
      }
    }

    if (bestScore > 100 && bestMatch) {
      // Save verification log
      try {
        const verificationLog = {
          timestamp: new Date().toISOString(),
          userName: bestMatch.name,
          score: bestScore,
          success: true
        };

        const existingLogs = JSON.parse(localStorage.getItem('verificationLogs') || '[]');
        existingLogs.push(verificationLog);

        // Keep only last 50 logs
        if (existingLogs.length > 50) {
          existingLogs.splice(0, existingLogs.length - 50);
        }

        localStorage.setItem('verificationLogs', JSON.stringify(existingLogs));
      } catch (error) {
        console.error('Error saving verification log:', error);
      }

      setMessage(`✓ Verifikasi Berhasil! ${bestMatch.name} (Score: ${bestScore}/199)`);
    } else {
      // Save failed verification log
      try {
        const verificationLog = {
          timestamp: new Date().toISOString(),
          score: bestScore,
          success: false
        };

        const existingLogs = JSON.parse(localStorage.getItem('verificationLogs') || '[]');
        existingLogs.push(verificationLog);

        if (existingLogs.length > 50) {
          existingLogs.splice(0, existingLogs.length - 50);
        }

        localStorage.setItem('verificationLogs', JSON.stringify(existingLogs));
      } catch (error) {
        console.error('Error saving verification log:', error);
      }

      setMessage(`✗ Sidik jari tidak cocok. Score tertinggi: ${bestScore}/199`);
    }
  };

  const deleteUser = (id: number) => {
    const updatedUsers = users.filter(u => u.id !== id);
    setUsers(updatedUsers);

    // Explicitly save to localStorage
    try {
      localStorage.setItem('fingerprintUsers', JSON.stringify(updatedUsers));
      setMessage('User berhasil dihapus dari penyimpanan lokal');
    } catch (error) {
      setMessage('User berhasil dihapus, tetapi gagal memperbarui penyimpanan lokal');
    }
  };

  const clearAllData = () => {
    if (confirm('Apakah Anda yakin ingin menghapus semua data? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        localStorage.removeItem('fingerprintUsers');
        localStorage.removeItem('lastCaptured');
        localStorage.removeItem('verificationLogs');
        setUsers([]);
        setLastCaptured(null);
        setMessage('Semua data berhasil dihapus dari penyimpanan lokal');
      } catch (error) {
        setMessage('Gagal menghapus data dari penyimpanan lokal');
      }
    }
  };

  const exportData = () => {
    try {
      const data = {
        users: users,
        lastCaptured: lastCaptured,
        exportDate: new Date().toISOString()
      };

      const dataStr = JSON.stringify(data, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `fingerprint_data_${new Date().getTime()}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      setMessage('Data berhasil diekspor');
    } catch (error) {
      setMessage('Gagal mengekspor data');
    }
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.users && Array.isArray(data.users)) {
          setUsers(data.users);
          localStorage.setItem('fingerprintUsers', JSON.stringify(data.users));
          if (data.lastCaptured) {
            setLastCaptured(data.lastCaptured);
            localStorage.setItem('lastCaptured', JSON.stringify(data.lastCaptured));
          }
          setMessage(`Berhasil mengimpor ${data.users.length} user`);
        } else {
          setMessage('Format file tidak valid');
        }
      } catch (error) {
        setMessage('Gagal mengimpor data. Format file tidak valid.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-900 via-purple-900 to-pink-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-white/10 backdrop-blur-md rounded-full mb-4">
            <Fingerprint className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Sistem Sidik Jari SecuGen</h1>
          <p className="text-white/80 text-lg">Sistem biometrik yang aman dan terpercaya</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Database className="w-4 h-4 text-white/60" />
            <span className="text-white/60 text-sm">Data tersimpan di localStorage</span>
            {storageStatus === 'saving' && <span className="text-yellow-400 text-sm">Menyimpan...</span>}
            {storageStatus === 'loading' && <span className="text-blue-400 text-sm">Memuat...</span>}
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl backdrop-blur-md transition-all duration-300 ${message.includes('✓') || message.includes('berhasil')
            ? 'bg-green-500/20 text-green-100 border border-green-400/30'
            : message.includes('✗') || message.includes('Error') || message.includes('Gagal')
              ? 'bg-red-500/20 text-red-100 border border-red-400/30'
              : 'bg-blue-500/20 text-blue-100 border border-blue-400/30'
            }`}>
            <div className="flex items-center">
              {message.includes('✓') && <CheckCircle className="w-5 h-5 mr-2" />}
              {message.includes('✗') && <AlertCircle className="w-5 h-5 mr-2" />}
              {message}
            </div>
          </div>
        )}

        {/* Storage Management */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-white/80" />
              <span className="text-white/80 text-sm">Total User: {users.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportData}
                className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all text-sm flex items-center gap-1"
              >
                <Database className="w-4 h-4" />
                Export Data
              </button>
              <label className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-all text-sm flex items-center gap-1 cursor-pointer">
                <Database className="w-4 h-4" />
                Import Data
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="hidden"
                />
              </label>
              <button
                onClick={clearAllData}
                className="px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-all text-sm flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Hapus Semua
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Left Column - User Actions */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl">
              {/* Tab Navigation */}
              <div className="flex mb-6 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('enroll')}
                  className={`flex-1 py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-all ${activeTab === 'enroll'
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:text-white'
                    }`}
                >
                  <UserPlus className="w-4 h-4" />
                  Pendaftaran
                </button>
                <button
                  onClick={() => setActiveTab('verify')}
                  className={`flex-1 py-2 px-4 rounded-md flex items-center justify-center gap-2 transition-all ${activeTab === 'verify'
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/70 hover:text-white'
                    }`}
                >
                  <Shield className="w-4 h-4" />
                  Verifikasi
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'enroll' ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                      <UserPlus className="w-6 h-6" />
                      Daftar User Baru
                    </h2>
                    <p className="text-white/70 mb-4">Masukkan nama lengkap dan letakkan jari pada scanner</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-white/80 mb-2 text-sm font-medium">Nama Lengkap</label>
                      <input
                        type="text"
                        placeholder="Masukkan nama lengkap"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all"
                      />
                    </div>

                    <button
                      onClick={enrollUser}
                      disabled={isCapturing}
                      className="w-full bg-linear-to-r from-indigo-500 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all duration-300 flex items-center justify-center gap-2 shadow-lg"
                    >
                      {isCapturing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Menangkap Sidik Jari...
                        </>
                      ) : (
                        <>
                          <Scan className="w-5 h-5" />
                          Capture & Daftar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                      <Shield className="w-6 h-6" />
                      Verifikasi Sidik Jari
                    </h2>
                    <p className="text-white/70 mb-4">Letakkan jari di scanner untuk memverifikasi identitas</p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <div className="flex items-center justify-center mb-4">
                      <div className="p-4 bg-white/10 rounded-full">
                        <Fingerprint className="w-12 h-12 text-white" />
                      </div>
                    </div>

                    <button
                      onClick={verifyFingerprint}
                      disabled={isCapturing || users.length === 0}
                      className="w-full bg-linear-to-r from-green-500 to-teal-600 text-white py-3 px-4 rounded-lg hover:from-green-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all duration-300 flex items-center justify-center gap-2 shadow-lg"
                    >
                      {isCapturing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Memverifikasi...
                        </>
                      ) : (
                        <>
                          <Scan className="w-5 h-5" />
                          Verifikasi Sekarang
                        </>
                      )}
                    </button>

                    {users.length === 0 && (
                      <p className="text-center text-white/60 mt-4 text-sm">
                        Belum ada user terdaftar. Silakan daftarkan user terlebih dahulu.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Last Captured Data */}
            {lastCaptured && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl mt-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Detail Capture Terakhir
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <img
                        src={`data:image/bmp;base64,${lastCaptured.image}`}
                        alt="Fingerprint"
                        className="w-full rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-white/70 text-sm">Image Quality</span>
                        <span className="text-white font-medium">{lastCaptured.quality}/100</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div
                          className="bg-linear-to-r from-green-400 to-green-600 h-2 rounded-full"
                          style={{ width: `${lastCaptured.quality}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-white/70 text-sm">NFIQ Score</span>
                        <span className="text-white font-medium">{lastCaptured.nfiq}/5</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div
                          className="bg-linear-to-r from-yellow-400 to-orange-500 h-2 rounded-full"
                          style={{ width: `${(5 - lastCaptured.nfiq) * 20}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <p className="text-white/70 text-sm mb-2">Template (base64)</p>
                      <textarea
                        readOnly
                        value={lastCaptured.template}
                        className="w-full h-24 p-2 bg-white/5 border border-white/10 rounded text-xs text-white/80 font-mono resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - User List */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl h-full">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Daftar User ({users.length})
              </h2>

              {users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="p-4 bg-white/5 rounded-full mb-4">
                    <Users className="w-8 h-8 text-white/50" />
                  </div>
                  <p className="text-white/50 text-center">Belum ada user terdaftar</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {users.map(user => (
                    <div key={user.id} className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-all">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-semibold text-white">{user.name}</p>
                          <p className="text-xs text-white/60 mt-1">Terdaftar: {user.enrollDate}</p>
                        </div>
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-white text-sm font-medium mb-1">Catatan Penting:</p>
              <p className="text-white/70 text-sm">Pastikan SGIBIOSRV berjalan di localhost:8443 dan fingerprint reader terhubung dengan benar. Data tersimpan di localStorage browser dan akan tetap ada setelah refresh halaman.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
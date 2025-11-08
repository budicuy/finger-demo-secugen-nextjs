'use client';

import React, { useState } from 'react';
import { Fingerprint, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';

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

  const captureFingerprint = async (): Promise<string | null> => {
    setIsCapturing(true);
    setMessage('Menangkap sidik jari...');
    
    try {
      const params = new URLSearchParams({
        Timeout: '10000',
        Quality: '50',
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
        setLastCaptured({
          template: data.TemplateBase64,
          image: data.BMPBase64,
          quality: data.ImageQuality,
          nfiq: data.NFIQ
        });
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
      
      setUsers([...users, newUser]);
      setMessage(`${name} berhasil didaftarkan!`);
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
      setMessage(`✓ Verifikasi Berhasil! ${bestMatch.name} (Score: ${bestScore}/199)`);
    } else {
      setMessage(`✗ Sidik jari tidak cocok. Score tertinggi: ${bestScore}/199`);
    }
  };

  const deleteUser = (id: number) => {
    setUsers(users.filter(u => u.id !== id));
    setMessage('User berhasil dihapus');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Fingerprint className="w-10 h-10 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">Sistem Sidik Jari SecuGen</h1>
          </div>
          
          {message && (
            <div className={`p-4 rounded-lg mb-6 ${message.includes('✓') || message.includes('berhasil') ? 'bg-green-100 text-green-800' : message.includes('✗') || message.includes('Error') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
              {message}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="border rounded-lg p-6 bg-gray-50">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Daftar User Baru
              </h2>
              <input
                type="text"
                placeholder="Nama Lengkap"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 border rounded-lg mb-4"
              />
              <button
                onClick={enrollUser}
                disabled={isCapturing}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 font-semibold"
              >
                {isCapturing ? 'Menangkap...' : 'Capture & Daftar'}
              </button>
            </div>

            <div className="border rounded-lg p-6 bg-gray-50">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Verifikasi Sidik Jari
              </h2>
              <p className="text-gray-600 mb-4">
                Letakkan jari di scanner untuk memverifikasi identitas
              </p>
              <button
                onClick={verifyFingerprint}
                disabled={isCapturing || users.length === 0}
                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-semibold"
              >
                {isCapturing ? 'Menangkap...' : 'Verifikasi Sekarang'}
              </button>
            </div>
          </div>

          {lastCaptured && (
            <div className="border rounded-lg p-4 mb-6 bg-gray-50">
              <h3 className="font-semibold mb-3">Detail Capture Terakhir:</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <img 
                    src={`data:image/bmp;base64,${lastCaptured.image}`} 
                    alt="Fingerprint"
                    className="border rounded w-full"
                  />
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2 px-3 bg-gray-100 font-semibold">Image Quality (1-100)</td>
                        <td className="py-2 px-3">{lastCaptured.quality}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3 bg-gray-100 font-semibold">NFIQ (1-5)</td>
                        <td className="py-2 px-3">{lastCaptured.nfiq}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3 bg-gray-100 font-semibold">Template (base64)</td>
                        <td className="py-2 px-3">
                          <textarea 
                            readOnly 
                            value={lastCaptured.template} 
                            className="w-full h-32 p-2 text-xs border rounded font-mono"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Daftar User Terdaftar ({users.length})</h2>
            {users.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Belum ada user terdaftar</p>
            ) : (
              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-semibold text-gray-800">{user.name}</p>
                      <p className="text-sm text-gray-500">Terdaftar: {user.enrollDate}</p>
                    </div>
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
          <AlertCircle className="w-5 h-5 text-yellow-600 inline mr-2" />
          <strong>Catatan:</strong> Pastikan SGIBIOSRV berjalan di localhost:8443 dan fingerprint reader terhubung.
        </div>
      </div>
    </div>
  );
}
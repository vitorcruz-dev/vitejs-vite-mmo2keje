// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  Clock, Play, Pause, Square, Camera, Fingerprint,
  AlertTriangle, CheckCircle, User, Truck, Package,
  FileText, Edit3, Trash2, LogOut, Bell, Utensils,
  History, X, Upload, Download, Wrench, Cloud, CloudOff,
  KeyRound, Shield, Save
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// LIGAÇÃO AO SUPABASE (NUVEM)
// ==========================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const STORAGE_KEYS = {
  USERS: 'jjt_users_v2',
  SHIFTS: 'jjt_shifts_v2',
  INCIDENTS: 'jjt_incidents_v2',
  MATERIALS: 'jjt_materials_v2',
  TRUCKS: 'jjt_trucks_v2',
  ANOMALIES: 'jjt_anomalies_v2',
  ALERTS: 'jjt_alerts_v2'
};

const DEFAULT_USERS = [
  { id: 'admin-1', username: 'admin', password: '123', name: 'Gestor de Tráfego', phone: '', email: '', role: 'manager' },
  { id: 'drv-1', username: 'joao', password: '123', name: 'João Silva', phone: '', email: '', role: 'driver' },
  { id: 'drv-2', username: 'carlos', password: '123', name: 'Carlos Mendes', phone: '', email: '', role: 'driver' }
];

const DEFAULT_TRUCKS = [
  { id: 't-1', plate: 'AA-12-BB', model: 'Volvo FH 500', history: [] },
  { id: 't-2', plate: 'CC-34-DD', model: 'Scania R450', history: [] },
  { id: 't-3', plate: 'EE-56-FF', model: 'Mercedes Actros', history: [] }
];

const loadLocal = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const saveEverywhere = async (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Erro localStorage:', e);
  }
  if (supabase) {
    try {
      await supabase
        .from('app_data')
        .upsert({ key, value: data, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    } catch (e) {
      console.error('Erro Supabase:', e);
    }
  }
};

// ==========================================
// UTILITÁRIOS DE TEMPO E PDF
// ==========================================
const formatDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const formatDateTime = (iso) => {
  if (!iso) return '---';
  const d = new Date(iso);
  return d.toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const toDatetimeLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

const generateAnomalyPDF = (item) => {
  const doc = new jsPDF();
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('JJTEIXEIRA - GESTÃO DE FROTA', 14, 16);
  doc.setFontSize(11);
  doc.text(
    item.category === 'material'
      ? 'RELATÓRIO DE PEDIDO / ANOMALIA DE MATERIAL'
      : 'RELATÓRIO DE ANOMALIA DE CAMIÃO',
    14,
    25
  );

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(12);
  let y = 46;
  const addLine = (label, value) => {
    doc.setFont(undefined, 'bold');
    doc.text(`${label}:`, 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(value || '---'), 60, y);
    y += 10;
  };

  addLine('Data / Hora', formatDateTime(item.createdAt));
  addLine('Motorista', item.driverName);
  addLine('Matrícula / Camião', item.truckPlate || 'N/A');
  if (item.category === 'material') {
    addLine('Material Pedido', item.itemName);
    addLine('Quantidade', item.quantity || '1');
  } else {
    addLine('Gravidade', item.severity || 'Normal');
  }

  y += 4;
  doc.setFont(undefined, 'bold');
  doc.text('Descrição / Detalhes:', 14, y);
  y += 8;
  doc.setFont(undefined, 'normal');
  const splitDesc = doc.splitTextToSize(item.description || 'Sem descrição adicional.', 180);
  doc.text(splitDesc, 14, y);
  y += splitDesc.length * 7 + 20;

  doc.setDrawColor(148, 163, 184);
  doc.line(14, y, 90, y);
  doc.line(120, y, 196, y);
  doc.setFontSize(10);
  doc.text('Assinatura do Gestor de Tráfego', 14, y + 6);
  doc.text('Assinatura Oficina / Armazém', 120, y + 6);

  doc.save(`JJTEIXEIRA_${item.category}_${Date.now()}.pdf`);
};

// ==========================================
// COMPONENTE: MINHA CONTA (DADOS E SENHA)
// ==========================================
function MyAccountPanel({ user, users, setUsers, setCurrentUser, shifts = [] }) {
  const [name, setName] = useState(user.name || '');
  const [username, setUsername] = useState(user.username || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [email, setEmail] = useState(user.email || '');
  const [profileFeedback, setProfileFeedback] = useState({ type: '', text: '' });

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passFeedback, setPassFeedback] = useState({ type: '', text: '' });

  const myShifts = shifts.filter((s) => s.driverId === user.id);
  const totalOvertime = myShifts.reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

  const handleProfileSave = (e) => {
    e.preventDefault();
    setProfileFeedback({ type: '', text: '' });

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanName || !cleanUsername) {
      setProfileFeedback({ type: 'error', text: 'O nome e o utilizador são obrigatórios.' });
      return;
    }

    const duplicate = users.some(
      (u) => u.id !== user.id && u.username.toLowerCase() === cleanUsername
    );
    if (duplicate) {
      setProfileFeedback({ type: 'error', text: `O utilizador "${cleanUsername}" já está a ser utilizado.` });
      return;
    }

    const updatedFields = {
      name: cleanName,
      username: cleanUsername,
      phone: phone.trim(),
      email: email.trim()
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, ...updatedFields } : u))
    );
    setCurrentUser((prev) => ({ ...prev, ...updatedFields }));
    setProfileFeedback({ type: 'success', text: 'Dados da conta atualizados com sucesso!' });
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setPassFeedback({ type: '', text: '' });

    if (currentPass !== user.password) {
      setPassFeedback({ type: 'error', text: 'A palavra-passe atual está incorreta.' });
      return;
    }
    if (newPass.length < 3) {
      setPassFeedback({ type: 'error', text: 'A nova palavra-passe deve ter pelo menos 3 caracteres.' });
      return;
    }
    if (newPass !== confirmPass) {
      setPassFeedback({ type: 'error', text: 'A confirmação da nova palavra-passe não coincide.' });
      return;
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, password: newPass } : u))
    );
    setCurrentUser((prev) => ({ ...prev, password: newPass }));
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
    setPassFeedback({ type: 'success', text: 'Palavra-passe atualizada com sucesso!' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Alterar Dados Pessoais */}
      <form onSubmit={handleProfileSave} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center gap-3 border-b pb-3">
          <div className="w-11 h-11 bg-blue-100 text-blue-800 rounded-xl flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Os Meus Dados</h3>
            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">
              {user.role === 'manager' ? 'Gestor de Tráfego / Admin' : 'Motorista JJTEIXEIRA'}
            </span>
          </div>
        </div>

        {user.role === 'driver' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border rounded-xl p-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Turnos Registados</p>
              <p className="text-xl font-extrabold text-slate-800 mt-0.5">{myShifts.length}</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-[11px] font-bold text-blue-700 uppercase">Horas Extra</p>
              <p className="text-xl font-extrabold text-blue-900 mt-0.5">{totalOvertime}h</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Nome Completo</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Utilizador (Login)</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Telemóvel</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 912 345 678"
              className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: nome@jjteixeira.pt"
              className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {profileFeedback.text && (
          <p
            className={`text-sm p-3 rounded-xl font-medium ${
              profileFeedback.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {profileFeedback.text}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl transition shadow-sm flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" /> Guardar Dados da Conta
        </button>
      </form>

      {/* Alterar Palavra-passe */}
      <form onSubmit={handlePasswordChange} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <KeyRound className="w-5 h-5 text-blue-700" />
          <h3 className="text-lg font-bold text-slate-800">Alterar Palavra-passe</h3>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Palavra-passe Atual</label>
          <input
            type="password"
            required
            value={currentPass}
            onChange={(e) => setCurrentPass(e.target.value)}
            placeholder="Introduza a palavra-passe atual"
            className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Nova Palavra-passe</label>
          <input
            type="password"
            required
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="Introduza a nova palavra-passe"
            className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Confirmar Nova Palavra-passe</label>
          <input
            type="password"
            required
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="Repita a nova palavra-passe"
            className="w-full border rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {passFeedback.text && (
          <p
            className={`text-sm p-3 rounded-xl font-medium ${
              passFeedback.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {passFeedback.text}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition shadow-sm"
        >
          Atualizar Palavra-passe
        </button>
      </form>
    </div>
  );
}

// ==========================================
// COMPONENTE DE CÂMARA / UPLOAD / BIOMETRIA
// ==========================================
function ValidationModal({ title, onConfirm, onCancel }) {
  const [method, setMethod] = useState('photo');
  const [photo, setPhoto] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const [fingerProgress, setFingerProgress] = useState(0);
  const [fingerDone, setFingerDone] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (method === 'photo' && !photo) {
      setCameraError(false);
      navigator.mediaDevices
        ?.getUserMedia({ video: { facingMode: 'user' } })
        .catch(() => navigator.mediaDevices?.getUserMedia({ video: true }))
        .then((stream) => {
          if (!active) {
            stream?.getTracks().forEach((t) => t.stop());
            return;
          }
          if (stream && videoRef.current) {
            streamRef.current = stream;
            videoRef.current.srcObject = stream;
          } else {
            setCameraError(true);
          }
        })
        .catch(() => {
          if (active) setCameraError(true);
        });
    }
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [method, photo]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    setPhoto(dataUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  const startFingerprint = () => {
    if (fingerDone) return;
    setFingerProgress(0);
    const interval = setInterval(() => {
      setFingerProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setFingerDone(true);
          return 100;
        }
        return prev + 20;
      });
    }, 150);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setMethod('photo')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium border transition ${
              method === 'photo'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" /> Foto Facial
          </button>
          <button
            onClick={() => setMethod('fingerprint')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium border transition ${
              method === 'fingerprint'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <Fingerprint className="w-4 h-4" /> Impressão Digital
          </button>
        </div>

        {method === 'photo' ? (
          <div className="space-y-3">
            {photo ? (
              <div className="relative">
                <img src={photo} alt="Validação" className="w-full h-56 object-cover rounded-xl border" />
                <button
                  onClick={() => setPhoto(null)}
                  className="mt-2 w-full py-2 text-sm text-blue-600 font-medium hover:underline"
                >
                  Tirar / escolher outra foto
                </button>
              </div>
            ) : cameraError ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
                <Camera className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 mb-3">
                  Câmara não detetada neste dispositivo. Carregue uma fotografia:
                </p>
                <label className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 text-sm font-medium">
                  <Upload className="w-4 h-4" /> Carregar Fotografia
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-56 bg-black rounded-xl object-cover"
                />
                <div className="flex gap-2">
                  <button
                    onClick={capturePhoto}
                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" /> Capturar Foto
                  </button>
                  <label className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl cursor-pointer hover:bg-slate-200 flex items-center">
                    <Upload className="w-4 h-4" />
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            )}

            <button
              disabled={!photo}
              onClick={() => onConfirm({ method: 'photo', photo })}
              className="w-full py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition"
            >
              Confirmar Validação Facial
            </button>
          </div>
        ) : (
          <div className="text-center py-4 space-y-4">
            <button
              onClick={startFingerprint}
              className={`w-28 h-28 mx-auto rounded-full flex items-center justify-center border-4 transition-all ${
                fingerDone
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                  : 'bg-blue-50 border-blue-400 text-blue-600 hover:scale-105 active:scale-95'
              }`}
            >
              <Fingerprint className="w-16 h-16" />
            </button>
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-150"
                style={{ width: `${fingerProgress}%` }}
              />
            </div>
            <p className="text-sm text-slate-600">
              {fingerDone
                ? 'Impressão digital validada com sucesso!'
                : 'Toque no sensor acima para validar a sua impressão digital'}
            </p>
            <button
              disabled={!fingerDone}
              onClick={() => onConfirm({ method: 'fingerprint', photo: null })}
              className="w-full py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition"
            >
              Confirmar Impressão Digital
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// APLICAÇÃO PRINCIPAL
// ==========================================
export default function App() {
  const [now, setNow] = useState(new Date());
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [cloudConnected, setCloudConnected] = useState(false);

  const [users, setUsersState] = useState(() => loadLocal(STORAGE_KEYS.USERS, DEFAULT_USERS));
  const [shifts, setShiftsState] = useState(() => loadLocal(STORAGE_KEYS.SHIFTS, []));
  const [incidents, setIncidentsState] = useState(() => loadLocal(STORAGE_KEYS.INCIDENTS, []));
  const [materials, setMaterialsState] = useState(() => loadLocal(STORAGE_KEYS.MATERIALS, []));
  const [trucks, setTrucksState] = useState(() => loadLocal(STORAGE_KEYS.TRUCKS, DEFAULT_TRUCKS));
  const [anomalies, setAnomaliesState] = useState(() => loadLocal(STORAGE_KEYS.ANOMALIES, []));
  const [alerts, setAlertsState] = useState(() => loadLocal(STORAGE_KEYS.ALERTS, []));

  const updateState = (setter, key) => (updater) => {
    setter((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveEverywhere(key, next);
      return next;
    });
  };

  const setUsers = updateState(setUsersState, STORAGE_KEYS.USERS);
  const setShifts = updateState(setShiftsState, STORAGE_KEYS.SHIFTS);
  const setIncidents = updateState(setIncidentsState, STORAGE_KEYS.INCIDENTS);
  const setMaterials = updateState(setMaterialsState, STORAGE_KEYS.MATERIALS);
  const setTrucks = updateState(setTrucksState, STORAGE_KEYS.TRUCKS);
  const setAnomalies = updateState(setAnomaliesState, STORAGE_KEYS.ANOMALIES);
  const setAlerts = updateState(setAlertsState, STORAGE_KEYS.ALERTS);

  // Sincronização automática com o Supabase a cada 5 segundos
  useEffect(() => {
    if (!supabase) return;

    const syncFromCloud = async () => {
      const { data, error } = await supabase.from('app_data').select('key, value');
      if (error) {
        setCloudConnected(false);
        return;
      }
      setCloudConnected(true);
      const map = {};
      (data || []).forEach((row) => {
        map[row.key] = row.value;
      });
      if (map[STORAGE_KEYS.USERS]) setUsersState(map[STORAGE_KEYS.USERS]);
      if (map[STORAGE_KEYS.SHIFTS]) setShiftsState(map[STORAGE_KEYS.SHIFTS]);
      if (map[STORAGE_KEYS.INCIDENTS]) setIncidentsState(map[STORAGE_KEYS.INCIDENTS]);
      if (map[STORAGE_KEYS.MATERIALS]) setMaterialsState(map[STORAGE_KEYS.MATERIALS]);
      if (map[STORAGE_KEYS.TRUCKS]) setTrucksState(map[STORAGE_KEYS.TRUCKS]);
      if (map[STORAGE_KEYS.ANOMALIES]) setAnomaliesState(map[STORAGE_KEYS.ANOMALIES]);
      if (map[STORAGE_KEYS.ALERTS]) setAlertsState(map[STORAGE_KEYS.ALERTS]);
    };

    syncFromCloud();
    const interval = setInterval(syncFromCloud, 5000);
    return () => clearInterval(interval);
  }, []);

  // Relógio global sempre ativo
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 41.1579, lng: -8.6291, label: 'GPS indisponível' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`
          }),
        () => resolve({ lat: 41.1579, lng: -8.6291, label: 'Localização não autorizada' }),
        { timeout: 5000 }
      );
    });

  const handleLogin = (e) => {
    e.preventDefault();
    const found = users.find(
      (u) => u.username.toLowerCase() === loginUser.trim().toLowerCase() && u.password === loginPass
    );
    if (!found) {
      setLoginError('Utilizador ou palavra-passe incorretos.');
      return;
    }
    setCurrentUser(found);
    setLoginError('');
    setLoginUser('');
    setLoginPass('');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col">
      {/* CABEÇALHO GLOBAL */}
      <header className="bg-blue-900 text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-2 rounded-xl">
              <Truck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="font-extrabold tracking-wide text-lg leading-tight">JJTEIXEIRA</h1>
              <div className="flex items-center gap-2 text-xs text-blue-200">
                <span>Controlo de Frota</span>
                {cloudConnected ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded-full">
                    <Cloud className="w-3 h-3" /> Nuvem
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full">
                    <CloudOff className="w-3 h-3" /> Local
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-blue-950/70 border border-blue-700/60 px-4 py-1.5 rounded-xl flex items-center gap-2 font-mono">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-base">{now.toLocaleTimeString('pt-PT')}</span>
              <span className="text-xs text-blue-300 hidden sm:inline">
                | {now.toLocaleDateString('pt-PT')}
              </span>
            </div>

            {currentUser && (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold leading-tight">{currentUser.name}</p>
                  <p className="text-xs text-blue-300">
                    {currentUser.role === 'manager' ? 'Gestor de Tráfego' : 'Motorista'}
                  </p>
                </div>
                <button
                  onClick={() => setCurrentUser(null)}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-100 p-2 rounded-xl transition"
                  title="Terminar Sessão"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        {!currentUser ? (
          <div className="max-w-md mx-auto mt-12 bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 text-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Truck className="w-9 h-9" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Acesso JJTEIXEIRA</h2>
              <p className="text-sm text-slate-500 mt-1">Introduza as suas credenciais</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Utilizador</label>
                <input
                  type="text"
                  required
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="Utilizador"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Palavra-passe</label>
                <input
                  type="password"
                  required
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {loginError && (
                <p className="text-sm text-red-600 bg-red-50 p-2.5 rounded-lg">{loginError}</p>
              )}
              <button
                type="submit"
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl transition shadow-md"
              >
                Entrar
              </button>
            </form>
          </div>
        ) : currentUser.role === 'driver' ? (
          <DriverDashboard
            user={currentUser}
            users={users}
            setCurrentUser={setCurrentUser}
            setUsers={setUsers}
            now={now}
            shifts={shifts}
            setShifts={setShifts}
            incidents={incidents}
            setIncidents={setIncidents}
            materials={materials}
            setMaterials={setMaterials}
            trucks={trucks}
            anomalies={anomalies}
            setAnomalies={setAnomalies}
            setAlerts={setAlerts}
            getLocation={getLocation}
          />
        ) : (
          <ManagerDashboard
            user={currentUser}
            setCurrentUser={setCurrentUser}
            now={now}
            users={users}
            setUsers={setUsers}
            shifts={shifts}
            setShifts={setShifts}
            incidents={incidents}
            materials={materials}
            setMaterials={setMaterials}
            trucks={trucks}
            setTrucks={setTrucks}
            anomalies={anomalies}
            setAnomalies={setAnomalies}
            alerts={alerts}
            setAlerts={setAlerts}
          />
        )}
      </main>
    </div>
  );
}

// ==========================================
// PAINEL DO MOTORISTA
// ==========================================
function DriverDashboard({
  user, users, setCurrentUser, setUsers, now, shifts, setShifts, incidents, setIncidents,
  materials, setMaterials, trucks, anomalies, setAnomalies,
  setAlerts, getLocation
}) {
  const [tab, setTab] = useState('shift');
  const [validationAction, setValidationAction] = useState(null);
  const [showEndForm, setShowEndForm] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [endOvertime, setEndOvertime] = useState('0');
  const [smsAlertOpen, setSmsAlertOpen] = useState(false);

  const [incType, setIncType] = useState('Carga Danificada');
  const [incTruck, setIncTruck] = useState(trucks[0]?.plate || '');
  const [incDesc, setIncDesc] = useState('');
  const [incPhoto, setIncPhoto] = useState(null);

  const [matTruck, setMatTruck] = useState(trucks[0]?.plate || '');
  const [matItem, setMatItem] = useState('Réguas');
  const [matQty, setMatQty] = useState('1');
  const [matDesc, setMatDesc] = useState('');

  const [anomTruck, setAnomTruck] = useState(trucks[0]?.plate || '');
  const [anomSeverity, setAnomSeverity] = useState('Média');
  const [anomDesc, setAnomDesc] = useState('');

  const myShifts = shifts.filter((s) => s.driverId === user.id);
  const activeShift = myShifts.find((s) => !s.endTime);

  const getLiveStats = (shift) => {
    if (!shift) return { driving: 0, pause: 0, meal: 0, continuous: 0 };
    const elapsedSinceLast = Math.max(
      0,
      Math.floor((now.getTime() - new Date(shift.lastStateChange).getTime()) / 1000)
    );
    const driving = shift.drivingSeconds + (shift.status === 'driving' ? elapsedSinceLast : 0);
    const pause = shift.pauseSeconds + (shift.status === 'pause' ? elapsedSinceLast : 0);
    const meal = shift.mealSeconds + (shift.status === 'meal' ? elapsedSinceLast : 0);
    const continuous =
      shift.status === 'driving' ? shift.continuousDrivingSeconds + elapsedSinceLast : 0;
    return { driving, pause, meal, continuous };
  };

  const live = getLiveStats(activeShift);

  useEffect(() => {
    if (activeShift && activeShift.status === 'driving' && live.continuous >= 14400 && !activeShift.sms4hAck) {
      setSmsAlertOpen(true);
    }
  }, [live.continuous, activeShift]);

  const acknowledgeSms = () => {
    setShifts((prev) =>
      prev.map((s) => (s.id === activeShift.id ? { ...s, sms4hAck: true } : s))
    );
    setSmsAlertOpen(false);
  };

  const simulatePlus1Hour = () => {
    if (!activeShift || activeShift.status !== 'driving') return;
    setShifts((prev) =>
      prev.map((s) =>
        s.id === activeShift.id
          ? {
              ...s,
              drivingSeconds: s.drivingSeconds + 3600,
              continuousDrivingSeconds: s.continuousDrivingSeconds + 3600
            }
          : s
      )
    );
  };

  const handleConfirmValidation = async (valData) => {
    const loc = await getLocation();
    const timestamp = new Date().toISOString();

    if (validationAction === 'start') {
      const newShift = {
        id: `sh-${Date.now()}`,
        driverId: user.id,
        driverName: user.name,
        startTime: timestamp,
        endTime: null,
        startLocation: loc,
        endLocation: null,
        startValidation: valData,
        endValidation: null,
        status: 'driving',
        lastStateChange: timestamp,
        drivingSeconds: 0,
        pauseSeconds: 0,
        mealSeconds: 0,
        continuousDrivingSeconds: 0,
        sms4hAck: false,
        overtimeHours: 0,
        notes: '',
        validatedByManager: false
      };
      setShifts((prev) => [newShift, ...prev]);
    } else if (validationAction === 'end' && activeShift) {
      const stats = getLiveStats(activeShift);
      setShifts((prev) =>
        prev.map((s) =>
          s.id === activeShift.id
            ? {
                ...s,
                endTime: timestamp,
                endLocation: loc,
                endValidation: valData,
                status: 'ended',
                drivingSeconds: stats.driving,
                pauseSeconds: stats.pause,
                mealSeconds: stats.meal,
                continuousDrivingSeconds: 0,
                overtimeHours: parseFloat(endOvertime) || 0,
                notes: endNotes.trim()
              }
            : s
        )
      );
      setEndNotes('');
      setEndOvertime('0');
    }
    setValidationAction(null);
  };

  const changeShiftStatus = (newStatus) => {
    if (!activeShift) return;
    const stats = getLiveStats(activeShift);
    const timestamp = new Date().toISOString();
    setShifts((prev) =>
      prev.map((s) =>
        s.id === activeShift.id
          ? {
              ...s,
              status: newStatus,
              lastStateChange: timestamp,
              drivingSeconds: stats.driving,
              pauseSeconds: stats.pause,
              mealSeconds: stats.meal,
              continuousDrivingSeconds: 0,
              sms4hAck: newStatus === 'driving' ? false : s.sms4hAck
            }
          : s
      )
    );
  };

  const handleIncidentSubmit = (e) => {
    e.preventDefault();
    const item = {
      id: `inc-${Date.now()}`,
      driverId: user.id,
      driverName: user.name,
      type: incType,
      truckPlate: incTruck,
      description: incDesc,
      photo: incPhoto,
      createdAt: new Date().toISOString()
    };
    setIncidents((prev) => [item, ...prev]);
    setIncDesc('');
    setIncPhoto(null);
    alert('Ocorrência registada com sucesso!');
  };

  const handleMaterialSubmit = (e) => {
    e.preventDefault();
    const item = {
      id: `mat-${Date.now()}`,
      category: 'material',
      driverId: user.id,
      driverName: user.name,
      truckPlate: matTruck,
      itemName: matItem,
      quantity: matQty,
      description: matDesc,
      delivered: false,
      createdAt: new Date().toISOString()
    };
    setMaterials((prev) => [item, ...prev]);
    setAlerts((prev) => [item, ...prev]);
    setMatDesc('');
    setMatQty('1');
    alert('Pedido de material enviado ao gestor!');
  };

  const handleAnomalySubmit = (e) => {
    e.preventDefault();
    const item = {
      id: `anom-${Date.now()}`,
      category: 'truck',
      driverId: user.id,
      driverName: user.name,
      truckPlate: anomTruck,
      severity: anomSeverity,
      description: anomDesc,
      createdAt: new Date().toISOString()
    };
    setAnomalies((prev) => [item, ...prev]);
    setAlerts((prev) => [item, ...prev]);
    setAnomDesc('');
    alert('Anomalia reportada! O gestor foi alertado.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
        {[
          { id: 'shift', label: 'Turno Atual', icon: Clock },
          { id: 'history', label: 'Meu Histórico', icon: History },
          { id: 'incidents', label: 'Acidentes / Carga', icon: Camera },
          { id: 'materials', label: 'Pedir Material', icon: Package },
          { id: 'anomalies', label: 'Avarias Camião', icon: Wrench },
          { id: 'account', label: 'Minha Conta', icon: User }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition ${
              tab === t.id ? 'bg-blue-700 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'shift' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {!activeShift ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-20 h-20 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto">
                <Play className="w-10 h-10 ml-1" />
              </div>
              <h2 className="text-2xl font-bold">Pronto para iniciar o turno?</h2>
              <p className="text-slate-500 max-w-md mx-auto text-sm">
                A abertura de turno regista a sua localização GPS e requer validação por fotografia facial ou impressão digital.
              </p>
              <button
                onClick={() => setValidationAction('start')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-4 rounded-2xl text-lg shadow-lg inline-flex items-center gap-3 transition"
              >
                <Play className="w-6 h-6" /> Início de Turno
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap justify-between items-center gap-4 border-b pb-4">
                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      activeShift.status === 'driving'
                        ? 'bg-emerald-100 text-emerald-800'
                        : activeShift.status === 'pause'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    ●{' '}
                    {activeShift.status === 'driving'
                      ? 'Em Condução'
                      : activeShift.status === 'pause'
                      ? 'Em Pausa'
                      : 'Almoço / Jantar'}
                  </span>
                  <p className="text-sm text-slate-500 mt-1">
                    Iniciado às {formatDateTime(activeShift.startTime)} • GPS: {activeShift.startLocation?.label}
                  </p>
                </div>

                {activeShift.status === 'driving' && (
                  <button
                    onClick={simulatePlus1Hour}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium border"
                  >
                    +1h Condução (Testar Alerta 4h)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl">
                  <p className="text-xs font-bold text-blue-700 uppercase">Condução Total</p>
                  <p className="text-3xl font-mono font-extrabold text-blue-900 mt-1">
                    {formatDuration(live.driving)}
                  </p>
                </div>
                <div
                  className={`p-4 rounded-2xl border ${
                    live.continuous >= 14400
                      ? 'bg-red-50 border-red-300'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <p className="text-xs font-bold uppercase text-slate-600">Condução Contínua (Max 4h30)</p>
                  <p
                    className={`text-3xl font-mono font-extrabold mt-1 ${
                      live.continuous >= 14400 ? 'text-red-600' : 'text-emerald-800'
                    }`}
                  >
                    {formatDuration(live.continuous)}
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl">
                  <p className="text-xs font-bold text-amber-700 uppercase">Tempo de Pausa</p>
                  <p className="text-3xl font-mono font-extrabold text-amber-900 mt-1">
                    {formatDuration(live.pause)}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl">
                  <p className="text-xs font-bold text-purple-700 uppercase">Almoço / Jantar</p>
                  <p className="text-3xl font-mono font-extrabold text-purple-900 mt-1">
                    {formatDuration(live.meal)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {activeShift.status !== 'driving' ? (
                  <button
                    onClick={() => changeShiftStatus('driving')}
                    className="sm:col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow"
                  >
                    <Play className="w-5 h-5" /> Retomar Condução
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => changeShiftStatus('pause')}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow"
                    >
                      <Pause className="w-5 h-5" /> Pausa
                    </button>
                    <button
                      onClick={() => changeShiftStatus('meal')}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow"
                    >
                      <Utensils className="w-5 h-5" /> Almoço / Jantar
                    </button>
                  </>
                )}

                <button
                  onClick={() => setShowEndForm(true)}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow"
                >
                  <Square className="w-5 h-5" /> Fim de Turno
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold mb-4">O Meu Histórico de Turnos</h3>
          {myShifts.length === 0 ? (
            <p className="text-slate-500 text-sm">Ainda não tem turnos registados.</p>
          ) : (
            <div className="space-y-3">
              {myShifts.map((s) => (
                <div key={s.id} className="border rounded-xl p-4 flex flex-wrap justify-between gap-4 bg-slate-50">
                  <div>
                    <p className="font-bold text-slate-800">
                      Início: {formatDateTime(s.startTime)} | Fim: {formatDateTime(s.endTime)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Condução: {formatDuration(s.drivingSeconds)} • Pausa: {formatDuration(s.pauseSeconds)} • Almoço/Jantar: {formatDuration(s.mealSeconds)} • Horas Extra: <strong>{s.overtimeHours || 0}h</strong>
                    </p>
                    {s.notes && <p className="text-xs text-slate-600 mt-1 italic">Obs: "{s.notes}"</p>}
                  </div>
                  <span
                    className={`self-start px-3 py-1 rounded-full text-xs font-bold ${
                      s.validatedByManager
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {s.validatedByManager ? 'Validado' : 'Pendente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'incidents' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleIncidentSubmit} className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
            <h3 className="text-lg font-bold">Reportar Carga Danificada / Acidente</h3>
            <div>
              <label className="block text-sm font-semibold mb-1">Tipo de Ocorrência</label>
              <select value={incType} onChange={(e) => setIncType(e.target.value)} className="w-full border rounded-xl p-2.5">
                <option>Carga Danificada</option>
                <option>Acidente com Camião</option>
                <option>Incidente em Carga/Descarga</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Camião (Matrícula)</label>
              <select value={incTruck} onChange={(e) => setIncTruck(e.target.value)} className="w-full border rounded-xl p-2.5">
                {trucks.map((t) => (
                  <option key={t.id} value={t.plate}>{t.plate} - {t.model}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Descrição</label>
              <textarea required rows={3} value={incDesc} onChange={(e) => setIncDesc(e.target.value)} placeholder="Descreva o sucedido..." className="w-full border rounded-xl p-2.5" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Fotografia</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = (ev) => setIncPhoto(ev.target.result);
                  r.readAsDataURL(f);
                }}
                className="w-full text-sm"
              />
              {incPhoto && <img src={incPhoto} alt="Preview" className="mt-2 h-32 rounded-xl object-cover border" />}
            </div>
            <button type="submit" className="w-full bg-blue-700 text-white font-bold py-3 rounded-xl hover:bg-blue-800">
              Enviar Ocorrência
            </button>
          </form>

          <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-3">
            <h3 className="text-lg font-bold">As Minhas Ocorrências</h3>
            {incidents.filter((i) => i.driverId === user.id).map((i) => (
              <div key={i.id} className="border rounded-xl p-3 bg-slate-50 flex gap-3">
                {i.photo && <img src={i.photo} alt="" className="w-16 h-16 rounded-lg object-cover" />}
                <div>
                  <p className="font-bold text-sm">{i.type} ({i.truckPlate})</p>
                  <p className="text-xs text-slate-600">{i.description}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(i.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleMaterialSubmit} className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
            <h3 className="text-lg font-bold">Pedir Material para o Camião</h3>
            <div>
              <label className="block text-sm font-semibold mb-1">Camião</label>
              <select value={matTruck} onChange={(e) => setMatTruck(e.target.value)} className="w-full border rounded-xl p-2.5">
                {trucks.map((t) => (
                  <option key={t.id} value={t.plate}>{t.plate} - {t.model}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-1">Material</label>
                <select value={matItem} onChange={(e) => setMatItem(e.target.value)} className="w-full border rounded-xl p-2.5">
                  <option>Réguas</option>
                  <option>Líquido dos Vidros</option>
                  <option>Óleo do Motor</option>
                  <option>Cintas de Amarração</option>
                  <option>AdBlue</option>
                  <option>Lâmpadas / Fusíveis</option>
                  <option>Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Quantidade</label>
                <input type="number" min="1" value={matQty} onChange={(e) => setMatQty(e.target.value)} className="w-full border rounded-xl p-2.5" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Observações</label>
              <textarea rows={2} value={matDesc} onChange={(e) => setMatDesc(e.target.value)} placeholder="Detalhes adicionais..." className="w-full border rounded-xl p-2.5" />
            </div>
            <button type="submit" className="w-full bg-blue-700 text-white font-bold py-3 rounded-xl hover:bg-blue-800">
              Enviar Pedido de Material
            </button>
          </form>

          <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-3">
            <h3 className="text-lg font-bold">Os Meus Pedidos</h3>
            {materials.filter((m) => m.driverId === user.id).map((m) => (
              <div key={m.id} className="border rounded-xl p-3 bg-slate-50 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm">{m.itemName} (x{m.quantity}) - {m.truckPlate}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${m.delivered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {m.delivered ? 'Entregue' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'anomalies' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleAnomalySubmit} className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
            <h3 className="text-lg font-bold">Reportar Anomalia / Avaria no Camião</h3>
            <div>
              <label className="block text-sm font-semibold mb-1">Camião</label>
              <select value={anomTruck} onChange={(e) => setAnomTruck(e.target.value)} className="w-full border rounded-xl p-2.5">
                {trucks.map((t) => (
                  <option key={t.id} value={t.plate}>{t.plate} - {t.model}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Gravidade</label>
              <select value={anomSeverity} onChange={(e) => setAnomSeverity(e.target.value)} className="w-full border rounded-xl p-2.5">
                <option>Baixa</option>
                <option>Média</option>
                <option>Urgente (Imobiliza Camião)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Descrição da Avaria</label>
              <textarea required rows={3} value={anomDesc} onChange={(e) => setAnomDesc(e.target.value)} placeholder="Ex: Luz de travão fundida, fuga de ar..." className="w-full border rounded-xl p-2.5" />
            </div>
            <button type="submit" className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">
              Reportar Anomalia
            </button>
          </form>

          <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-3">
            <h3 className="text-lg font-bold">Anomalias Reportadas por Mim</h3>
            {anomalies.filter((a) => a.driverId === user.id).map((a) => (
              <div key={a.id} className="border rounded-xl p-3 bg-red-50/50">
                <p className="font-bold text-sm text-red-800">{a.truckPlate} • {a.severity}</p>
                <p className="text-xs text-slate-700 mt-1">{a.description}</p>
                <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(a.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'account' && (
        <MyAccountPanel
          user={user}
          users={users}
          setUsers={setUsers}
          setCurrentUser={setCurrentUser}
          shifts={shifts}
        />
      )}

      {showEndForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">Fecho de Turno</h3>
            <div>
              <label className="block text-sm font-semibold mb-1">Quantas horas extra fez hoje?</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={endOvertime}
                onChange={(e) => setEndOvertime(e.target.value)}
                className="w-full border rounded-xl p-2.5"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Observações (Opcional)</label>
              <textarea
                rows={3}
                value={endNotes}
                onChange={(e) => setEndNotes(e.target.value)}
                placeholder="Algum comentário sobre o serviço de hoje?"
                className="w-full border rounded-xl p-2.5"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowEndForm(false)} className="flex-1 py-2.5 rounded-xl border font-semibold text-slate-600">
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowEndForm(false);
                  setValidationAction('end');
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-700 text-white font-bold"
              >
                Avançar para Validação
              </button>
            </div>
          </div>
        </div>
      )}

      {validationAction && (
        <ValidationModal
          title={validationAction === 'start' ? 'Validar Início de Turno' : 'Validar Fim de Turno'}
          onConfirm={handleConfirmValidation}
          onCancel={() => setValidationAction(null)}
        />
      )}

      {smsAlertOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-t-8 border-red-600 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-8 h-8" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">SMS DE AVISO - JJTEIXEIRA</p>
                <h3 className="text-lg font-extrabold">4 Horas de Condução Contínua!</h3>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              Atingiu <strong>4 horas seguidas de condução</strong>. Apenas dispõe de mais <strong>30 minutos</strong> antes de ser obrigatório realizar uma pausa regulamentar.
            </p>
            <button onClick={acknowledgeSms} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl">
              Validar e Confirmar Receção da SMS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// PAINEL DO GESTOR DE TRÁFEGO / ADMIN
// ==========================================
function ManagerDashboard({
  user, setCurrentUser, now, users, setUsers, shifts, setShifts, incidents,
  materials, setMaterials, trucks, setTrucks, anomalies,
  setAnomalies, alerts, setAlerts
}) {
  const [tab, setTab] = useState('timesheet');
  const [filterDriver, setFilterDriver] = useState('all');
  const [editingShift, setEditingShift] = useState(null);
  const [newAccount, setNewAccount] = useState({ name: '', username: '', password: '', role: 'driver' });
  const [accountError, setAccountError] = useState('');
  const [newTruck, setNewTruck] = useState({ plate: '', model: '' });

  const drivers = users.filter((u) => u.role === 'driver');

  const getLiveDuration = (s) => {
    if (s.endTime) return s.drivingSeconds;
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(s.lastStateChange).getTime()) / 1000));
    return s.drivingSeconds + (s.status === 'driving' ? elapsed : 0);
  };

  const validateShift = (id) => {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, validatedByManager: true } : s)));
  };

  const saveShiftEdit = (e) => {
    e.preventDefault();
    setShifts((prev) =>
      prev.map((s) =>
        s.id === editingShift.id
          ? {
              ...s,
              startTime: new Date(editingShift.startTime).toISOString(),
              endTime: editingShift.endTime ? new Date(editingShift.endTime).toISOString() : null,
              overtimeHours: parseFloat(editingShift.overtimeHours) || 0
            }
          : s
      )
    );
    setEditingShift(null);
  };

  const repairAnomaly = (anom) => {
    setAnomalies((prev) => prev.filter((a) => a.id !== anom.id));
    setTrucks((prev) =>
      prev.map((t) =>
        t.plate === anom.truckPlate
          ? {
              ...t,
              history: [
                {
                  id: anom.id,
                  description: anom.description,
                  reportedBy: anom.driverName,
                  reportedAt: anom.createdAt,
                  repairedAt: new Date().toISOString()
                },
                ...(t.history || [])
              ]
            }
          : t
      )
    );
  };

  const createAccount = (e) => {
    e.preventDefault();
    setAccountError('');
    const cleanUsername = newAccount.username.trim().toLowerCase();
    if (!newAccount.name.trim() || !cleanUsername || !newAccount.password) return;

    const exists = users.some((u) => u.username.toLowerCase() === cleanUsername);
    if (exists) {
      setAccountError(`O utilizador "${cleanUsername}" já existe.`);
      return;
    }

    setUsers((prev) => [
      ...prev,
      {
        id: `${newAccount.role === 'manager' ? 'admin' : 'drv'}-${Date.now()}`,
        name: newAccount.name.trim(),
        username: cleanUsername,
        password: newAccount.password,
        phone: '',
        email: '',
        role: newAccount.role
      }
    ]);
    setNewAccount({ name: '', username: '', password: '', role: 'driver' });
  };

  const deleteAccount = (targetUser) => {
    if (targetUser.id === user.id) {
      alert('Não pode eliminar a conta que está a utilizar neste momento.');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
  };

  const createTruck = (e) => {
    e.preventDefault();
    if (!newTruck.plate) return;
    setTrucks((prev) => [...prev, { id: `t-${Date.now()}`, ...newTruck, history: [] }]);
    setNewTruck({ plate: '', model: '' });
  };

  const filteredShifts =
    filterDriver === 'all' ? shifts : shifts.filter((s) => s.driverId === filterDriver);

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4 shadow-md space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-extrabold text-red-800 flex items-center gap-2">
              <Bell className="w-5 h-5 animate-bounce" /> Novos Alertas ({alerts.length})
            </h3>
            <button onClick={() => setAlerts([])} className="text-xs font-semibold text-red-700 hover:underline">
              Limpar todos os alertas
            </button>
          </div>
          <div className="space-y-2">
            {alerts.map((al) => (
              <div key={al.id} className="bg-white rounded-xl p-3 border border-red-200 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <p className="font-bold text-sm text-slate-800">
                    {al.category === 'material' ? '📦 Pedido de Material' : '🔧 Anomalia de Camião'} — {al.truckPlate}
                  </p>
                  <p className="text-xs text-slate-600">
                    Motorista: <strong>{al.driverName}</strong> • {al.itemName ? `${al.itemName} (x${al.quantity}) ` : ''}{al.description}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => generateAnomalyPDF(al)}
                    className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Gerar PDF
                  </button>
                  <button
                    onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== al.id))}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-3 py-2 rounded-lg"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
        {[
          { id: 'timesheet', label: 'Livro de Ponto', icon: Clock },
          { id: 'overtime', label: 'Horas Extra', icon: FileText },
          { id: 'incidents', label: 'Ocorrências', icon: Camera },
          { id: 'materials', label: 'Material', icon: Package },
          { id: 'trucks', label: 'Camiões & Avarias', icon: Truck },
          { id: 'admin', label: 'Administração', icon: Shield },
          { id: 'account', label: 'Minha Conta', icon: User }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition ${
              tab === t.id ? 'bg-blue-800 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'timesheet' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h2 className="text-lg font-bold">Livro de Ponto (Tempo Real)</h2>
            <select value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
              <option value="all">Todos os Motoristas</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
                <tr>
                  <th className="p-3">Motorista</th>
                  <th className="p-3">Início / Fim</th>
                  <th className="p-3">Condução (Ao Vivo)</th>
                  <th className="p-3">H. Extra</th>
                  <th className="p-3">GPS / Obs</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredShifts.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold">{s.driverName}</td>
                    <td className="p-3 text-xs">
                      <div>Início: {formatDateTime(s.startTime)}</div>
                      <div>Fim: {formatDateTime(s.endTime)}</div>
                    </td>
                    <td className="p-3 font-mono font-bold text-blue-800">
                      {formatDuration(getLiveDuration(s))}
                      {!s.endTime && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">ATIVO</span>}
                    </td>
                    <td className="p-3 font-bold">{s.overtimeHours || 0}h</td>
                    <td className="p-3 text-xs text-slate-500">
                      <div>GPS: {s.startLocation?.label}</div>
                      {s.notes && <div className="italic text-slate-700">"{s.notes}"</div>}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() =>
                          setEditingShift({
                            id: s.id,
                            startTime: toDatetimeLocal(s.startTime),
                            endTime: toDatetimeLocal(s.endTime),
                            overtimeHours: s.overtimeHours || 0
                          })
                        }
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Editar
                      </button>
                      {!s.validatedByManager ? (
                        <button
                          onClick={() => validateShift(s.id)}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Validar
                        </button>
                      ) : (
                        <span className="text-emerald-600 font-bold text-xs">✓ Validado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'overtime' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
          <h2 className="text-lg font-bold">Contabilidade de Horas Extra por Motorista</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drivers.map((d) => {
              const total = shifts
                .filter((s) => s.driverId === d.id)
                .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);
              return (
                <div key={d.id} className="border rounded-2xl p-4 bg-slate-50 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-800">{d.name}</p>
                    <p className="text-xs text-slate-500">@{d.username}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-blue-800">{total}h</p>
                    <p className="text-[11px] text-slate-500">Acumuladas</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'incidents' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
          <h2 className="text-lg font-bold">Ocorrências (Carga Danificada / Acidentes)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incidents.map((i) => (
              <div key={i.id} className="border rounded-xl p-4 flex gap-4 bg-slate-50">
                {i.photo && <img src={i.photo} alt="" className="w-24 h-24 rounded-xl object-cover border" />}
                <div>
                  <p className="font-bold text-red-700">{i.type} — {i.truckPlate}</p>
                  <p className="text-xs text-slate-500">Motorista: {i.driverName} • {formatDateTime(i.createdAt)}</p>
                  <p className="text-sm text-slate-700 mt-2">{i.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
          <h2 className="text-lg font-bold">Pedidos de Material</h2>
          <div className="space-y-3">
            {materials.map((m) => (
              <div key={m.id} className="border rounded-xl p-4 flex flex-wrap justify-between items-center gap-3 bg-slate-50">
                <div>
                  <p className="font-bold">{m.itemName} (x{m.quantity}) — {m.truckPlate}</p>
                  <p className="text-xs text-slate-500">Motorista: {m.driverName} • {formatDateTime(m.createdAt)}</p>
                  {m.description && <p className="text-xs text-slate-600 mt-1">{m.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => generateAnomalyPDF(m)} className="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> Gerar PDF
                  </button>
                  <button
                    onClick={() =>
                      setMaterials((prev) =>
                        prev.map((x) => (x.id === m.id ? { ...x, delivered: !x.delivered } : x))
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      m.delivered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-500 text-white'
                    }`}
                  >
                    {m.delivered ? '✓ Entregue' : 'Marcar Entregue'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'trucks' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
            <h2 className="text-lg font-bold text-red-700">Anomalias Ativas</h2>
            {anomalies.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma anomalia ativa de momento.</p>
            ) : (
              <div className="space-y-3">
                {anomalies.map((a) => (
                  <div key={a.id} className="border border-red-200 bg-red-50/40 rounded-xl p-4 flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <p className="font-bold text-red-800">{a.truckPlate} • {a.severity}</p>
                      <p className="text-xs text-slate-600">Reportado por {a.driverName} em {formatDateTime(a.createdAt)}</p>
                      <p className="text-sm mt-1">{a.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => generateAnomalyPDF(a)} className="px-3 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" /> Gerar PDF
                      </button>
                      <button onClick={() => repairAnomaly(a)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">
                        Reparado / Apagar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
            <h2 className="text-lg font-bold">Frota & Histórico de Reparações</h2>
            <form onSubmit={createTruck} className="flex flex-wrap gap-2">
              <input placeholder="Matrícula (ex: GG-78-HH)" value={newTruck.plate} onChange={(e) => setNewTruck({ ...newTruck, plate: e.target.value })} className="border rounded-xl px-3 py-2 text-sm" />
              <input placeholder="Modelo (ex: DAF XF)" value={newTruck.model} onChange={(e) => setNewTruck({ ...newTruck, model: e.target.value })} className="border rounded-xl px-3 py-2 text-sm" />
              <button type="submit" className="bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold">
                + Adicionar Camião
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trucks.map((t) => (
                <div key={t.id} className="border rounded-xl p-4 bg-slate-50 space-y-2">
                  <p className="font-bold text-slate-800">{t.plate} — {t.model}</p>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Histórico de Reparações ({t.history?.length || 0})</p>
                  {(t.history || []).map((h) => (
                    <div key={h.id} className="text-xs bg-white p-2 rounded border">
                      <p className="font-semibold">{h.description}</p>
                      <p className="text-slate-400">Reparado em {formatDateTime(h.repairedAt)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PÁGINA DE ADMINISTRAÇÃO DE LOGINS */}
      {tab === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={createAccount} className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Shield className="w-5 h-5 text-blue-700" />
              <h3 className="text-lg font-bold">Criar Novo Login</h3>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Tipo de Conta</label>
              <select
                value={newAccount.role}
                onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value })}
                className="w-full border rounded-xl p-2.5"
              >
                <option value="driver">Motorista</option>
                <option value="manager">Gestor / Administrador</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Nome Completo</label>
              <input
                required
                placeholder="Ex: Manuel Costa"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                className="w-full border rounded-xl p-2.5"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Utilizador (Login)</label>
              <input
                required
                placeholder="Ex: manuel"
                value={newAccount.username}
                onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })}
                className="w-full border rounded-xl p-2.5"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Palavra-passe</label>
              <input
                required
                type="password"
                placeholder="Defina a palavra-passe"
                value={newAccount.password}
                onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                className="w-full border rounded-xl p-2.5"
              />
            </div>
            {accountError && (
              <p className="text-sm text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">{accountError}</p>
            )}
            <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl transition">
              Criar Login
            </button>
          </form>

          <div className="bg-white rounded-2xl p-6 shadow-sm border space-y-3">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold">Logins Registados ({users.length})</h3>
            </div>
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {users.map((u) => (
                <div key={u.id} className="border rounded-xl p-3 flex justify-between items-center bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-slate-800">{u.name}</p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          u.role === 'manager'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {u.role === 'manager' ? 'Admin' : 'Motorista'}
                      </span>
                      {u.id === user.id && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Tu
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      User: <span className="font-mono font-semibold">{u.username}</span> | Pass: <span className="font-mono">{u.password}</span>
                    </p>
                  </div>
                  <button
                    disabled={u.id === user.id}
                    onClick={() => deleteAccount(u)}
                    className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed p-2 rounded-lg hover:bg-red-50 transition"
                    title={u.id === user.id ? 'Não pode eliminar a própria conta' : 'Eliminar login'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'account' && (
        <MyAccountPanel
          user={user}
          users={users}
          setUsers={setUsers}
          setCurrentUser={setCurrentUser}
        />
      )}

      {editingShift && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={saveShiftEdit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">Editar Horário do Turno</h3>
            <div>
              <label className="block text-sm font-semibold mb-1">Hora de Início</label>
              <input type="datetime-local" required value={editingShift.startTime} onChange={(e) => setEditingShift({ ...editingShift, startTime: e.target.value })} className="w-full border rounded-xl p-2.5" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Hora de Fim</label>
              <input type="datetime-local" value={editingShift.endTime} onChange={(e) => setEditingShift({ ...editingShift, endTime: e.target.value })} className="w-full border rounded-xl p-2.5" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Horas Extra</label>
              <input type="number" step="0.5" min="0" value={editingShift.overtimeHours} onChange={(e) => setEditingShift({ ...editingShift, overtimeHours: e.target.value })} className="w-full border rounded-xl p-2.5" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingShift(null)} className="flex-1 py-2.5 rounded-xl border font-semibold">
                Cancelar
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-blue-700 text-white font-bold">
                Guardar Alterações
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
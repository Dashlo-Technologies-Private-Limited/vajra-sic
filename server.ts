import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. DATA STORE (RBAC & ZAWARMALA FLEET)
// ==========================================
type Role = "admin" | "shift_incharge" | "bp_incharge" | "oem_rep";

interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  oemCompany?: string;
  tokenNo: string;
}

interface Machine {
  id: number;
  code: string;
  type: "LPDT" | "LHD" | "JUMBO" | "SIMBA" | "LOCO";
  oem: string;
  capacityTonnes: number;
  levelRl: number;
  status: "active" | "idle" | "breakdown" | "maintenance";
  operator: string;
  fuelRpm: number;
}

interface Breakdown {
  id: number;
  machineCode: string;
  category: string;
  desc: string;
  severity: "Critical" | "High" | "Medium";
  delayMins: number;
  etr: string;
  tech: string;
  isResolved: boolean;
}

const users: User[] = [
  { id: 1, name: "S. K. Sharma", tokenNo: "HZL-ADM-01", email: "admin@hzl.com", password: "123", role: "admin" },
  { id: 2, name: "Dushyant Tailor", tokenNo: "HZL-SIC-09", email: "incharge@hzl.com", password: "123", role: "shift_incharge" },
  { id: 3, name: "M. K. Verma", tokenNo: "HZL-BP-04", email: "bp@hzl.com", password: "123", role: "bp_incharge" },
  { id: 4, name: "G. Sen (OEM)", tokenNo: "OEM-SND-88", email: "oem@sandvik.com", password: "123", role: "oem_rep", oemCompany: "Sandvik" }
];

let fleet: Machine[] = [
  { id: 1, code: "EMT-01", type: "LPDT", oem: "Sandvik", capacityTonnes: 30, levelRl: -120, status: "active", operator: "R. Sharma (4819)", fuelRpm: 1850 },
  { id: 2, code: "EMT-03", type: "LPDT", oem: "Sandvik", capacityTonnes: 30, levelRl: -120, status: "active", operator: "V. Meena (3910)", fuelRpm: 1920 },
  { id: 3, code: "EMT-05", type: "LPDT", oem: "Sandvik", capacityTonnes: 30, levelRl: -120, status: "idle", operator: "Unassigned", fuelRpm: 750 },
  { id: 4, code: "CL-11",  type: "LHD",  oem: "Epiroc",  capacityTonnes: 14, levelRl: -200, status: "active", operator: "D. Prajapat (5102)", fuelRpm: 2100 },
  { id: 5, code: "CL-19",  type: "LHD",  oem: "Epiroc",  capacityTonnes: 14, levelRl: -120, status: "breakdown", operator: "A. Khan (1094)", fuelRpm: 0 },
  { id: 6, code: "M2D-16", type: "JUMBO", oem: "Sandvik", capacityTonnes: 0, levelRl: -200, status: "active", operator: "S. Dhakar (4411)", fuelRpm: 1600 },
  { id: 7, code: "SIMBA-1",type: "SIMBA", oem: "Epiroc",  capacityTonnes: 0, levelRl: -120, status: "active", operator: "K. Gurjar (3319)", fuelRpm: 1750 }
];

let breakdowns: Breakdown[] = [
  { id: 101, machineCode: "CL-19", category: "Hydraulic Line", desc: "Main hose burst at -120 mRL header", severity: "Critical", delayMins: 45, etr: "25 mins", tech: "OEM Sandvik Field Team", isResolved: false },
  { id: 102, machineCode: "EMT-05", category: "Chute Jam", desc: "Granulator GB-02 chute feeder blockage", severity: "High", delayMins: 28, etr: "10 mins", tech: "Mechanical Attendant", isResolved: false }
];

let metrics = {
  runRate: 53.4,
  targetRate: 60.0,
  hoistTonnesShift: 1480,
  targetTonnesShift: 1650,
  recoveryExecuted: false
};

// ==========================================
// 2. REAL-TIME ENGINE (SSE)
// ==========================================
interface ConnectedClient {
  id: number;
  res: Response;
  user: User;
}

let clients: ConnectedClient[] = [];

function broadcast(event: string, payload: any) {
  clients.forEach(c => c.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
}

app.get("/api/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const clientId = Date.now();
  const userId = Number(req.query.userId);
  const user = users.find(u => u.id === userId) || users[1];

  const client: ConnectedClient = { id: clientId, res, user };
  clients.push(client);

  broadcast("presence", { 
    count: clients.length,
    users: clients.map(c => ({ name: c.user.name, role: c.user.role }))
  });

  req.on("close", () => {
    clients = clients.filter(c => c.id !== clientId);
    broadcast("presence", { 
      count: clients.length,
      users: clients.map(c => ({ name: c.user.name, role: c.user.role }))
    });
  });
});

// ==========================================
// 3. API ROUTES WITH RBAC PERMISSIONS
// ==========================================
app.post("/api/auth/login", (req, res) => {
  const { email, password, role } = req.body;
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  if (role && user.role !== role) {
    return res.status(403).json({ error: `Access Denied: Account is not provisioned for role '${role.toUpperCase()}'.` });
  }

  res.json({ user });
});

app.post("/api/auth/signup", (req, res) => {
  const { name, email, password, role, oemCompany } = req.body;
  const tokenNo = "HZL-" + Math.floor(1000 + Math.random() * 9000);
  const newUser: User = { id: Date.now(), name, email, password, role, oemCompany, tokenNo };
  users.push(newUser);
  res.json({ user: newUser });
});

app.get("/api/state", (_req, res) => {
  res.json({ fleet, breakdowns, metrics });
});

// Machine Toggle: Admin, Shift Incharge, or matching OEM Rep
app.post("/api/fleet/status", (req, res) => {
  const { code, status, userRole, userOem } = req.body;
  const m = fleet.find(item => item.code === code);
  if (!m) return res.status(404).json({ error: "Machine not found." });

  if (userRole === "bp_incharge") {
    return res.status(403).json({ error: "BP Incharge has Read-Only permissions for fleet state." });
  }

  if (userRole === "oem_rep" && m.oem.toLowerCase() !== (userOem || "").toLowerCase()) {
    return res.status(403).json({ error: `OEM Access Restricted: You can only modify ${userOem} assets.` });
  }

  m.status = status;
  broadcast("state_update", { fleet, metrics });
  res.json({ success: true });
});

// Short Interval Recovery: Restricted to Shift Incharge & Admin
app.post("/api/sic/approve-recovery", (req, res) => {
  const { userRole, approvedBy } = req.body;
  if (userRole !== "admin" && userRole !== "shift_incharge") {
    return res.status(403).json({ error: "Only Shift Incharge or Administrator can authorize recovery rerouting." });
  }

  metrics.recoveryExecuted = true;
  metrics.runRate = 55.8; // Recovers lost cycle tons
  const emt5 = fleet.find(m => m.code === "EMT-05");
  if (emt5) emt5.status = "active";

  broadcast("recovery_approved", { runRate: 55.8, approvedBy });
  broadcast("state_update", { fleet, metrics });
  res.json({ success: true });
});

// AI Assistant: Admin Only
app.post("/api/ai/command", (req, res) => {
  const { prompt, userRole, confirmed } = req.body;
  if (userRole !== "admin") {
    return res.status(403).json({ error: "Authorization Fault: The AI Administrative Assistant is restricted to Administrators only." });
  }

  const text = prompt.toLowerCase();
  if (text.includes("maintenance") || text.includes("breakdown")) {
    const code = text.includes("emt-05") ? "EMT-05" : (text.includes("emt-01") ? "EMT-01" : "CL-11");
    if (!confirmed) {
      return res.json({
        requiresConfirm: true,
        summary: `Set ${code} to MAINTENANCE status and alert OEM service deck.`,
        actionPayload: { code, status: "maintenance" }
      });
    }
    const target = fleet.find(m => m.code === code);
    if (target) target.status = "maintenance";
    broadcast("state_update", { fleet, metrics });
    return res.json({ success: true, message: `Action executed: ${code} transitioned to MAINTENANCE.` });
  }

  res.status(400).json({ error: "Unsupported instruction. Example: 'Change EMT-05 status to maintenance'" });
});

// ==========================================
// 4. EMBEDDED HIGH-END INDUSTRIAL UI
// ==========================================
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VAJRA // Mining Short Interval Control & Fleet Command</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      background-color: #0B0E14;
      color: #C5D1DE;
      font-family: 'JetBrains Mono', monospace;
      -webkit-font-smoothing: antialiased;
    }
    .panel {
      background: #111620;
      border: 1px solid #1E2638;
    }
    .panel-glow {
      box-shadow: 0 0 25px -5px rgba(6, 182, 212, 0.12);
    }
    @keyframes scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(1000%); }
    }
    .scanline {
      position: absolute;
      top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(to right, transparent, rgba(6, 182, 212, 0.3), transparent);
      animation: scanline 8s linear infinite;
    }
    @keyframes radarPulse {
      0% { transform: scale(0.8); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 0.2; }
      100% { transform: scale(0.8); opacity: 0.8; }
    }
    .radar-pulse {
      animation: radarPulse 3s ease-in-out infinite;
    }
    @keyframes rotateDrill {
      100% { transform: rotate(360deg); }
    }
    .drill-spin {
      transform-origin: center;
      animation: rotateDrill 12s linear infinite;
    }
  </style>
</head>
<body class="min-h-screen flex flex-col justify-between overflow-x-hidden relative">

  <!-- Background Ambience -->
  <div class="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-950/20 via-transparent to-transparent"></div>

  <!-- ==================== SCREEN 1: LANDING & LIVE LOGO ==================== -->
  <div id="screen-landing" class="min-h-screen flex flex-col items-center justify-center p-6 relative z-10 text-center">
    <div class="scanline pointer-events-none"></div>

    <!-- Live Animated Mining Vector Logo -->
    <div class="relative w-36 h-36 mb-6 flex items-center justify-center">
      <!-- Outer telemetry pulse ring -->
      <div class="absolute inset-0 rounded-full border border-cyan-500/30 radar-pulse"></div>
      <div class="absolute inset-2 rounded-full border border-dashed border-cyan-400/40 drill-spin"></div>
      <div class="absolute inset-4 rounded-full border border-emerald-500/20"></div>

      <!-- Core SVG Drill & Pickaxe Crest -->
      <svg class="w-16 h-16 text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        <circle cx="12" cy="12" r="2" fill="currentColor" class="animate-ping"/>
      </svg>
    </div>

    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-700/50 text-[11px] text-cyan-400 mb-3 tracking-widest uppercase">
      <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
      HZL Zawarmala Mine Operational Hub
    </div>

    <h1 class="text-4xl md:text-5xl font-black tracking-widest text-white mb-2">V A J R A</h1>
    <p class="text-xs text-cyan-400 font-semibold tracking-wider uppercase mb-3">Vehicle, Asset & Job Roster Administration</p>
    <p class="max-w-lg text-xs text-gray-400 mb-8 leading-relaxed">
      Autonomous Short Interval Control platform converting real-time telemetry into dynamic shift recovery. Scaling underground metal productivity from 
      <span class="text-white font-bold">51T</span> to <span class="text-cyan-400 font-bold">60T Metal/Person/Year</span>.
    </p>

    <div class="flex flex-wrap gap-4 justify-center">
      <button onclick="showScreen('login')" class="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-8 rounded text-xs uppercase tracking-widest transition shadow-lg shadow-cyan-900/50 flex items-center gap-2">
        Access Control Room &rarr;
      </button>
      <button onclick="showScreen('signup')" class="bg-gray-900 hover:bg-gray-800 text-gray-300 font-semibold py-3 px-8 rounded text-xs uppercase tracking-widest border border-gray-700 transition">
        Provision Account
      </button>
    </div>

    <div class="mt-16 text-[10px] text-gray-600 tracking-widest">
      STATION ID: ZM-AAC-01 • HINDUSTAN ZINC LIMITED • VEDANTA
    </div>
  </div>

  <!-- ==================== SCREEN 2: LOGIN WITH STRICT RBAC ==================== -->
  <div id="screen-login" class="hidden min-h-screen flex items-center justify-center p-6 relative z-10">
    <div class="w-full max-w-md panel rounded-xl p-8 border border-gray-800 shadow-2xl relative">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-base font-bold text-white uppercase tracking-wider">Operational Sign In</h2>
          <p class="text-[11px] text-gray-400">Select authenticated role profile</p>
        </div>
        <button onclick="showScreen('landing')" class="text-xs text-gray-500 hover:text-white transition">&larr; Return</button>
      </div>

      <div class="space-y-4 text-xs">
        <div>
          <label class="block text-gray-400 mb-1 font-semibold tracking-wider uppercase">Role Profile (RBAC)</label>
          <select id="loginRole" class="w-full bg-[#0B0E14] border border-gray-700 rounded p-2.5 text-white outline-none focus:border-cyan-500">
            <option value="shift_incharge">Shift Incharge (Control Room Operations)</option>
            <option value="admin">Administrator (Master Clearance & AI Copilot)</option>
            <option value="bp_incharge">BP Incharge (Planning & Monitoring)</option>
            <option value="oem_rep">OEM Representative (Sandvik / Epiroc Fleet)</option>
          </select>
        </div>

        <div>
          <label class="block text-gray-400 mb-1 font-semibold tracking-wider uppercase">User Email</label>
          <input id="loginEmail" type="email" value="incharge@hzl.com" class="w-full bg-[#0B0E14] border border-gray-700 rounded p-2.5 text-white outline-none focus:border-cyan-500">
        </div>

        <div>
          <label class="block text-gray-400 mb-1 font-semibold tracking-wider uppercase">Password</label>
          <input id="loginPass" type="password" value="123" class="w-full bg-[#0B0E14] border border-gray-700 rounded p-2.5 text-white outline-none focus:border-cyan-500">
        </div>

        <button onclick="login()" class="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded text-xs uppercase tracking-wider transition mt-2 shadow-md shadow-cyan-950">
          Authenticate Clearance
        </button>

        <!-- Quick Demo Switchers -->
        <div class="pt-4 border-t border-gray-800 text-[11px] text-gray-500">
          <div class="mb-2 uppercase tracking-wider font-semibold text-[10px]">Instant Role Fill:</div>
          <div class="flex flex-wrap gap-2">
            <button onclick="quickRole('admin')" class="px-2 py-1 rounded bg-gray-900 border border-purple-800 text-purple-300 hover:bg-purple-950">Admin</button>
            <button onclick="quickRole('shift_incharge')" class="px-2 py-1 rounded bg-gray-900 border border-cyan-800 text-cyan-300 hover:bg-cyan-950">Incharge</button>
            <button onclick="quickRole('bp_incharge')" class="px-2 py-1 rounded bg-gray-900 border border-blue-800 text-blue-300 hover:bg-blue-950">BP Incharge</button>
            <button onclick="quickRole('oem_rep')" class="px-2 py-1 rounded bg-gray-900 border border-amber-800 text-amber-300 hover:bg-amber-950">OEM Rep</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== SCREEN 3: SIGNUP ==================== -->
  <div id="screen-signup" class="hidden min-h-screen flex items-center justify-center p-6 relative z-10">
    <div class="w-full max-w-md panel rounded-xl p-8 border border-gray-800 shadow-2xl">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-base font-bold text-white uppercase tracking-wider">Provision Role</h2>
          <p class="text-[11px] text-gray-400">Register in Zawarmala identity ledger</p>
        </div>
        <button onclick="showScreen('landing')" class="text-xs text-gray-500 hover:text-white">&larr; Return</button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block text-gray-400 mb-1">FULL NAME</label>
          <input id="regName" type="text" placeholder="Dushyant Tailor" class="w-full bg-[#0B0E14] border border-gray-700 rounded p-2 text-white outline-none focus:border-cyan-500">
        </div>
        <div>
          <label class="block text-gray-400 mb-1">EMAIL</label>
          <input id="regEmail" type="email" placeholder="dushyant.tailor@vedanta.co.in" class="w-full bg-[#0B0E14] border border-gray-700 rounded p-2 text-white outline-none focus:border-cyan-500">
        </div>
        <div>
          <label class="block text-gray-400 mb-1">CLEARANCE LEVEL (ROLE)</label>
          <select id="regRole" onchange="toggleOemSignup()" class="w-full bg-[#0B0E14] border border-gray-700 rounded p-2 text-white outline-none focus:border-cyan-500">
            <option value="shift_incharge">Shift Incharge</option>
            <option value="bp_incharge">BP Incharge</option>
            <option value="oem_rep">OEM Representative</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div id="oemFieldBox" class="hidden">
          <label class="block text-amber-400 mb-1">OEM COMPANY</label>
          <input id="regOem" type="text" placeholder="Sandvik or Epiroc" class="w-full bg-[#0B0E14] border border-amber-800 rounded p-2 text-white outline-none">
        </div>
        <div>
          <label class="block text-gray-400 mb-1">SECRET KEY</label>
          <input id="regPass" type="password" value="123" class="w-full bg-[#0B0E14] border border-gray-700 rounded p-2 text-white outline-none focus:border-cyan-500">
        </div>

        <button onclick="signup()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded text-xs uppercase tracking-wider transition mt-3">
          Provision User Clearance
        </button>
      </div>
    </div>
  </div>

  <!-- ==================== SCREEN 4: VAJRA COMMAND CONSOLE ==================== -->
  <div id="screen-app" class="hidden p-6 flex-1 flex flex-col relative z-10">
    <!-- Top Telemetry Status Header -->
    <header class="flex flex-wrap justify-between items-center pb-4 border-b border-gray-800/80 gap-4">
      <div class="flex items-center gap-3">
        <!-- Live Miniature Status Core -->
        <div class="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-950">
          <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <div class="text-sm font-bold text-white tracking-widest flex items-center gap-2">
            <span>VAJRA // SHORT INTERVAL CONTROL</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-normal">ZM-LIVE</span>
          </div>
          <p class="text-[10px] text-gray-400 tracking-wider">ZAWARMALA MINE • SHIFT B • RL -120 / -200 LEVELS</p>
        </div>
      </div>

      <!-- User Role Indicator & Live Concurrency Badge -->
      <div class="flex items-center gap-4 text-xs">
        <div class="bg-gray-950 border border-cyan-900/60 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span id="userCount" class="font-bold text-cyan-300">1</span>
          <span class="text-gray-400 text-[10px]">ACTIVE OPERATORS</span>
        </div>

        <div class="panel px-3 py-1 rounded border-gray-800 text-right">
          <div id="uName" class="font-bold text-white text-xs">--</div>
          <div id="uRoleBadge" class="text-[10px] font-bold uppercase tracking-wider">--</div>
        </div>

        <button onclick="logout()" class="text-gray-400 hover:text-white bg-gray-900 px-3 py-1.5 rounded border border-gray-800 hover:border-gray-700 text-xs transition">
          Exit Deck
        </button>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="flex gap-2 my-5 border-b border-gray-800/80 pb-3 text-xs overflow-x-auto">
      <button onclick="switchTab('sic')" id="tab-sic" class="px-4 py-2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/80 font-bold transition">1. Tactical SIC Dashboard</button>
      <button onclick="switchTab('fleet')" id="tab-fleet" class="px-4 py-2 rounded text-gray-400 hover:text-white transition">2. Telemetry Fleet</button>
      <button onclick="switchTab('breakdowns')" id="tab-breakdowns" class="px-4 py-2 rounded text-gray-400 hover:text-white transition">3. Breakdowns & Issues</button>
      <button onclick="switchTab('copilot')" id="tab-copilot" class="px-4 py-2 rounded text-gray-400 hover:text-white flex items-center gap-1.5 transition">
        <span class="text-purple-400 font-bold">&#x2728;</span> 4. Admin AI Copilot
      </button>
    </nav>

    <!-- TAB 1: SHORT INTERVAL CONTROL (SIC) -->
    <div id="pane-sic" class="space-y-6">
      <!-- High-Density Metric Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div class="panel p-4 rounded-xl relative overflow-hidden">
          <div class="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Takt Metal Run-Rate</div>
          <div class="text-2xl font-black text-white mt-1">
            <span id="rateVal">53.4</span> <span class="text-sm font-normal text-gray-400">/ 60.0 T/person</span>
          </div>
          <div class="w-full bg-gray-800 h-1.5 mt-3 rounded-full overflow-hidden">
            <div id="rateBar" class="bg-cyan-400 h-full transition-all duration-700" style="width: 89%;"></div>
          </div>
          <div class="text-[10px] text-cyan-400 mt-2 flex justify-between">
            <span>Primary KPI Progress</span>
            <span>+17.6% Target</span>
          </div>
        </div>

        <div class="panel p-4 rounded-xl">
          <div class="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Fleet Physical Availability</div>
          <div id="fleetAvail" class="text-2xl font-black text-emerald-400 mt-1">--</div>
          <div class="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live CAN-Bus Reporting
          </div>
        </div>

        <div class="panel p-4 rounded-xl">
          <div class="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Shift Hoist Tonnage</div>
          <div class="text-2xl font-black text-white mt-1">
            1,480 <span class="text-sm font-normal text-gray-400">/ 1,650 T</span>
          </div>
          <div class="text-[10px] text-emerald-400 mt-2 font-semibold">+8% Ahead of Cycle Interval</div>
        </div>

        <div class="panel p-4 rounded-xl">
          <div class="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Active Critical Delays</div>
          <div id="delayAlertCount" class="text-2xl font-black text-amber-400 mt-1">1 Delay</div>
          <div class="text-[10px] text-gray-400 mt-2">CL-19 Hose Leak (-120 mRL)</div>
        </div>
      </div>

      <!-- Prescriptive Shift-Recovery Recommendation Card -->
      <div class="panel panel-glow rounded-xl p-5 border border-cyan-800/80 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div class="space-y-1">
          <div class="text-[11px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            Short Interval Control • AI Prescriptive Recovery Dispatch
          </div>
          <h3 class="text-sm font-bold text-white">CL-19 Breakdown & Granulator GB-02 Chute Jiggering Lag (-120 mRL)</h3>
          <p class="text-xs text-gray-400 max-w-2xl leading-relaxed">
            Divert EMT-05 hauler from -120 to -200 mRL Stope 04; reassign loader CL-11 to feed shaft pocket directly. Recovers +8.8T metal equivalent within current shift cycle.
          </p>
        </div>

        <div class="flex flex-col items-start lg:items-end gap-2 w-full lg:w-auto">
          <div class="text-xs text-emerald-400 font-bold tracking-wider">+8.8T Metal Yield Recovery</div>
          <button id="btnApprove" onclick="approveRecovery()" class="w-full lg:w-auto bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 px-5 rounded text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-950">
            Approve & Dispatch Work Order
          </button>
          <div id="rbacSicNotice" class="text-[10px] text-gray-500 hidden">Approval restricted to Shift Incharge or Admin.</div>
        </div>
      </div>
    </div>

    <!-- TAB 2: TELEMETRY FLEET -->
    <div id="pane-fleet" class="hidden panel rounded-xl p-5 text-xs">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h2 class="text-sm font-bold text-white uppercase tracking-wider">Zawarmala Heavy Fleet Telemetry</h2>
          <p class="text-[11px] text-gray-500">Live CAN-Bus RPM, mRL level locations, and assignment dispatch</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="text-gray-400 border-b border-gray-800 pb-2">
            <tr>
              <th class="pb-2">MACHINE CODE</th>
              <th class="pb-2">TYPE</th>
              <th class="pb-2">OEM</th>
              <th class="pb-2">SUBLEVEL</th>
              <th class="pb-2">OPERATOR</th>
              <th class="pb-2">ENGINE RPM</th>
              <th class="pb-2">STATUS</th>
              <th class="pb-2 text-right">DISPATCH ACTION</th>
            </tr>
          </thead>
          <tbody id="fleetBody" class="divide-y divide-gray-800/60"></tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: BREAKDOWNS & DELAYS -->
    <div id="pane-breakdowns" class="hidden panel rounded-xl p-5 text-xs">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h2 class="text-sm font-bold text-white uppercase tracking-wider">Active Breakdowns & Telemetry Delays</h2>
          <p class="text-[11px] text-gray-500">Real-time ETR tracking and technician attendance logs</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="text-gray-400 border-b border-gray-800 pb-2">
            <tr>
              <th class="pb-2">MACHINE</th>
              <th class="pb-2">CATEGORY</th>
              <th class="pb-2">DESCRIPTION</th>
              <th class="pb-2">SEVERITY</th>
              <th class="pb-2">DELAY</th>
              <th class="pb-2">ETR</th>
              <th class="pb-2">TECHNICIAN</th>
            </tr>
          </thead>
          <tbody id="breakdownBody" class="divide-y divide-gray-800/60"></tbody>
        </table>
      </div>
    </div>

    <!-- TAB 4: ADMIN AI COPILOT -->
    <div id="pane-copilot" class="hidden max-w-2xl mx-auto space-y-4 w-full">
      <div class="panel border-purple-900/60 rounded-xl p-6 text-xs space-y-4">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-2">
            <span class="text-purple-400 font-bold">&#x2728;</span> AI Administrative Assistant (VAJRA-Copilot)
          </h2>
          <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
            Authorized for Administrators only. Natural language commands are parsed and staged in a strict confirmation gate before database execution.
          </p>
        </div>

        <div id="aiRbacLockNotice" class="hidden bg-red-950/40 border border-red-800 p-3 rounded text-red-300 text-xs">
          Role Access Prohibited: Your active clearance does not have Administrative AI write tokens.
        </div>

        <div id="aiInputGroup" class="flex gap-2">
          <input id="aiCmd" type="text" placeholder="e.g. Change machine EMT-05 status to maintenance" class="flex-1 bg-[#0B0E14] border border-gray-700 rounded p-2.5 text-white outline-none focus:border-purple-500">
          <button onclick="sendAI()" class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2.5 rounded uppercase tracking-wider transition">Execute</button>
        </div>

        <!-- Strict Confirmation Modal Box -->
        <div id="aiConfirm" class="hidden bg-[#0B0E14] border border-purple-700 p-4 rounded-lg space-y-2">
          <div class="text-amber-400 font-bold uppercase tracking-wider text-[11px]">COMMAND STAGED — CONFIRM EXECUTION</div>
          <div id="aiDesc" class="text-white text-xs">--</div>
          <div class="flex gap-2 pt-2">
            <button onclick="confirmAI(true)" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded uppercase text-[10px]">Confirm & Apply</button>
            <button onclick="confirmAI(false)" class="bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded uppercase text-[10px]">Dismiss</button>
          </div>
        </div>

        <div id="aiResult" class="text-emerald-400 font-bold text-xs"></div>
      </div>
    </div>
  </div>

  <!-- SCRIPTS -->
  <script>
    let user = null;
    let store = {};

    function showScreen(screen) {
      ['landing', 'login', 'signup', 'app'].forEach(s => {
        document.getElementById('screen-' + s).classList.add('hidden');
      });
      document.getElementById('screen-' + screen).classList.remove('hidden');
    }

    function quickRole(role) {
      document.getElementById('loginRole').value = role;
      if (role === 'admin') document.getElementById('loginEmail').value = 'admin@hzl.com';
      if (role === 'shift_incharge') document.getElementById('loginEmail').value = 'incharge@hzl.com';
      if (role === 'bp_incharge') document.getElementById('loginEmail').value = 'bp@hzl.com';
      if (role === 'oem_rep') document.getElementById('loginEmail').value = 'oem@sandvik.com';
      document.getElementById('loginPass').value = '123';
    }

    function toggleOemSignup() {
      const r = document.getElementById('regRole').value;
      if (r === 'oem_rep') document.getElementById('oemFieldBox').classList.remove('hidden');
      else document.getElementById('oemFieldBox').classList.add('hidden');
    }

    async function login() {
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPass').value;
      const role = document.getElementById('loginRole').value;

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role })
      });

      const data = await res.json();
      if (!res.ok) return alert(data.error);

      user = data.user;
      enterApp();
    }

    async function signup() {
      const name = document.getElementById('regName').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPass').value;
      const role = document.getElementById('regRole').value;
      const oemCompany = document.getElementById('regOem').value;

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, oemCompany })
      });

      const data = await res.json();
      user = data.user;
      enterApp();
    }

    function logout() {
      user = null;
      showScreen('landing');
    }

    function enterApp() {
      document.getElementById('uName').innerText = user.name;
      const rBadge = document.getElementById('uRoleBadge');
      rBadge.innerText = user.role.replace('_', ' ');

      // Color badge by role
      if (user.role === 'admin') rBadge.className = 'text-[10px] font-bold text-purple-400 uppercase tracking-wider';
      else if (user.role === 'shift_incharge') rBadge.className = 'text-[10px] font-bold text-cyan-400 uppercase tracking-wider';
      else if (user.role === 'bp_incharge') rBadge.className = 'text-[10px] font-bold text-blue-400 uppercase tracking-wider';
      else if (user.role === 'oem_rep') rBadge.className = 'text-[10px] font-bold text-amber-400 uppercase tracking-wider';

      applyRbacUI();
      showScreen('app');
      refreshState();
      initSSE();
    }

    function applyRbacUI() {
      // 1. Incharge or Admin can approve SIC recovery
      const btn = document.getElementById('btnApprove');
      const notice = document.getElementById('rbacSicNotice');
      if (user.role !== 'admin' && user.role !== 'shift_incharge') {
        btn.classList.add('opacity-40', 'cursor-not-allowed');
        btn.disabled = true;
        notice.classList.remove('hidden');
      } else {
        btn.classList.remove('opacity-40', 'cursor-not-allowed');
        btn.disabled = false;
        notice.classList.add('hidden');
      }

      // 2. Admin Copilot Access
      if (user.role !== 'admin') {
        document.getElementById('aiRbacLockNotice').classList.remove('hidden');
        document.getElementById('aiInputGroup').classList.add('opacity-40', 'pointer-events-none');
      } else {
        document.getElementById('aiRbacLockNotice').classList.add('hidden');
        document.getElementById('aiInputGroup').classList.remove('opacity-40', 'pointer-events-none');
      }
    }

    function switchTab(tabId) {
      ['sic', 'fleet', 'breakdowns', 'copilot'].forEach(t => {
        document.getElementById('pane-' + t).classList.add('hidden');
        document.getElementById('tab-' + t).className = "px-4 py-2 rounded text-gray-400 hover:text-white transition";
      });
      document.getElementById('pane-' + tabId).classList.remove('hidden');
      document.getElementById('tab-' + tabId).className = "px-4 py-2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/80 font-bold transition";
    }

    async function refreshState() {
      const res = await fetch('/api/state');
      store = await res.json();
      render();
    }

    function render() {
      document.getElementById('rateVal').innerText = store.metrics.runRate.toFixed(1);
      document.getElementById('rateBar').style.width = ((store.metrics.runRate / 60) * 100) + '%';
      document.getElementById('fleetAvail').innerText = store.fleet.filter(f => f.status === 'active').length + " / " + store.fleet.length;

      if (store.metrics.recoveryExecuted) {
        const btn = document.getElementById('btnApprove');
        btn.disabled = true;
        btn.className = "bg-emerald-950 border border-emerald-700 text-emerald-400 font-bold py-2 px-4 rounded text-xs uppercase cursor-default";
        btn.innerText = "Order Dispatched to Fleet";
      }

      // Render Fleet Table
      document.getElementById('fleetBody').innerHTML = store.fleet.map(m => {
        // Evaluate RBAC permissions for row
        let canEdit = false;
        if (user.role === 'admin' || user.role === 'shift_incharge') canEdit = true;
        if (user.role === 'oem_rep' && user.oemCompany && m.oem.toLowerCase() === user.oemCompany.toLowerCase()) canEdit = true;

        return \`
          <tr>
            <td class="py-3 font-bold \${m.status === 'breakdown' ? 'text-red-400' : 'text-cyan-400'}">\${m.code}</td>
            <td>\${m.type}</td>
            <td>\${m.oem}</td>
            <td>\${m.levelRl} mRL</td>
            <td>\${m.operator}</td>
            <td>\${m.fuelRpm} RPM</td>
            <td>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold \${
                m.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                m.status === 'idle' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                m.status === 'maintenance' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
                'bg-red-950 text-red-400 border border-red-800'
              }">\${m.status.toUpperCase()}</span>
            </td>
            <td class="text-right">
              \${canEdit ? \`
                <button onclick="toggleMachine('\${m.code}', '\${m.status === 'active' ? 'maintenance' : 'active'}')" class="text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-900 border border-gray-700 text-[10px]">
                  Toggle
                </button>
              \` : '<span class="text-gray-600 text-[10px]">Read-Only</span>'}
            </td>
          </tr>
        \`;
      }).join('');

      // Render Breakdown Table
      document.getElementById('breakdownBody').innerHTML = store.breakdowns.map(b => \`
        <tr>
          <td class="py-3 font-bold text-white">\${b.machineCode}</td>
          <td>\${b.category}</td>
          <td>\${b.desc}</td>
          <td><span class="text-red-400 font-bold">\${b.severity}</span></td>
          <td>\${b.delayMins} min</td>
          <td>\${b.etr}</td>
          <td>\${b.tech}</td>
        </tr>
      \`).join('');
    }

    async function toggleMachine(code, status) {
      const res = await fetch('/api/fleet/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, status, userRole: user.role, userOem: user.oemCompany })
      });
      const data = await res.json();
      if (!res.ok) alert(data.error);
    }

    async function approveRecovery() {
      const res = await fetch('/api/sic/approve-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userRole: user.role, approvedBy: user.name })
      });
      const data = await res.json();
      if (!res.ok) alert(data.error);
    }

    let pendingAction = null;
    async function sendAI() {
      const prompt = document.getElementById('aiCmd').value;
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userRole: user.role, confirmed: false })
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error);

      if (data.requiresConfirm) {
        pendingAction = prompt;
        document.getElementById('aiDesc').innerText = data.summary;
        document.getElementById('aiConfirm').classList.remove('hidden');
      }
    }

    async function confirmAI(approved) {
      document.getElementById('aiConfirm').classList.add('hidden');
      if (!approved) return;

      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: pendingAction, userRole: user.role, confirmed: true })
      });
      const data = await res.json();
      document.getElementById('aiResult').innerText = data.message;
      document.getElementById('aiCmd').value = '';
    }

    function initSSE() {
      const evt = new EventSource('/api/events?userId=' + user.id);
      evt.addEventListener('presence', (e) => {
        const payload = JSON.parse(e.data);
        document.getElementById('userCount').innerText = payload.count;
      });
      evt.addEventListener('state_update', (e) => {
        const payload = JSON.parse(e.data);
        store.fleet = payload.fleet;
        store.metrics = payload.metrics;
        render();
      });
      evt.addEventListener('recovery_approved', (e) => {
        const payload = JSON.parse(e.data);
        store.metrics.recoveryExecuted = true;
        store.metrics.runRate = payload.runRate;
        render();
      });
    }
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`VAJRA Control Room online at http://localhost:${PORT}`);
  });
}

export default app;
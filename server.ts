import express, { Request, Response } from "express";
import cors from "cors";


const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb", strict: true }));


// Express JSON parse error safety guard
app.use((err: any, _req: Request, res: Response, next: Function) => {
  if (err instanceof SyntaxError && (err as any).status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON request body payload." });
  }
  return next(err);
});


// ========================================================
// 1. DATA MODELS & ENUMERATIONS (HZL SIC SPECIFICATION)
// ========================================================
type Role = "admin" | "shift_incharge" | "bp_incharge" | "oem_rep" | "foreman" | "control_room";
type OEMVendor = "Sandvik" | "Epiroc" | "Komatsu" | "Caterpillar" | "GHH" | "Gainwell" | "AAC" | "Normet" | "MZL" | "Isuzu";
export type MachineCategory = "LPDT" | "LHD" | "DRILL" | "UTILITY" | "ADDITIONAL";
export type MachineStatus = "ok" | "active" | "idle" | "breakdown" | "gc_due" | "maintenance";
export type ReasonCategory = "MECHANICAL" | "HYDRAULIC" | "ELECTRICAL" | "TRANSMISSION" | "PNEUMATIC" | "GENERAL_CHECK" | "IDLE_OPERATIONAL" | "CHUTE_CRUSHER" | "SAFETY" | "ACCIDENT";


interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  oemCompany?: OEMVendor;
  section?: string;
  tokenNo: string;
}


interface Worker {
  tokenNo: number;
  name: string;
  designation: string;
  category: "HEMM_OPERATOR" | "STATUTORY_MATE" | "MAINTENANCE_TRADE" | "UG_CREW" | "SHAFT_CREW" | "ADMIN";
  shiftStatus: "PRESENT" | "ABSENT" | "SHORT_PUNCH" | "WEEKLY_OFF";
  isInsideMine: boolean;
  shortPunchHoursLost?: number;
  fatigueRiskLevel: "LOW" | "ELEVATED" | "HIGH_RISK";
  teleRemoteEligible: boolean;
  assignedAssetOrBeat?: string;
  sublevelRl?: number;
  productivity: {
    tonnesMuckedShift: number;
    drilledMetersShift: number;
    benchmarkVariancePct: number;
  };
}


export interface Machine {
  id: number;
  code: string;
  category: MachineCategory;
  type: "LPDT" | "LHD" | "JUMBO" | "PROD_DRILL" | "UTILITY" | "SERVICE" | "HV";
  oem: OEMVendor;
  model: string;
  nominalCapacity: number; // in Tonnes
  lastPayloadScan: number;
  levelRl: number;
  rampSlot?: "RAMP_NORTH_UP" | "RAMP_SOUTH_DOWN" | "PASSING_BAY_245" | "PASSING_BAY_228" | "PORTAL_HAUL" | "WORKSHOP_187" | "FUEL_BAY_250";
  status: MachineStatus;
  statusReason?: string;
  lastStatusUpdate: string;
  gcDueDate?: string;
  operator: string;
  engineRpm: number;
  transmissionTempC: number;
  hydraulicBar: number;
  teleRemoteReady: boolean;
  subsystemAlert?: string;
  idleTimeMins: number;
}


export interface MachineBreakdownLog {
  id: string;
  machineCode: string;
  machineCategory: MachineCategory;
  machineModel: string;
  oem: OEMVendor;
  status: MachineStatus;
  reason: string;
  reasonCategory: ReasonCategory;
  levelRl: number;
  reportedBy: string;
  reportedAt: string;
  delayMins: number;
  etr: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  escalationTier: "LEVEL_MATE" | "SHIFT_INCHARGE" | "MINE_MANAGER";
  actionTaken?: string;
  resolved: boolean;
  resolvedAt?: string;
}


export type TaskPriority = "CRITICAL_P1" | "HIGH_P2" | "MEDIUM_P3" | "LOW_P4";


export interface UndergroundTask {
  id: string;
  title: string;
  category: "HEMM_MUCKING" | "FACE_DRILL" | "STATUTORY_BEAT" | "CRUSHER_FEED" | "VENT_WALL" | "PUMP_SUMP" | "UTILITY_SUPPORT" | "GENERAL_CHECK";
  shiftCode?: "A" | "B" | "C";
  shiftTiming?: string;
  levelRl: number;
  targetAssetOrFace: string;
  priority: TaskPriority;
  requiredRole: "HEMM_OPERATOR" | "STATUTORY_MATE" | "MAINTENANCE_TRADE" | "UG_CREW";
  isHazardousTeleremote: boolean;
  assignedTokenNo?: number;
  assignedWorkerName?: string;
  assignedMachineCode?: string;
  targetMeters?: number;
  targetTonnes?: number;
  requestedBySection?: string;
  status: "PENDING" | "RECOMMENDED" | "CONFIRMED" | "DISPUTED" | "IN_PROGRESS" | "COMPLETED";
  notes?: string;
}


export interface StatutoryConflict {
  id: string;
  mateTokenNo: number;
  mateName: string;
  requestedBySections: string[];
  competingTasks: string[];
  sublevelRls: number[];
  escalatedTo: "MINE_MANAGER";
  status: "OPEN" | "RESOLVED";
  resolvedBeat?: string;
}


export interface HeadingFace {
  id: string;
  levelRl: number;
  cycleState: "SCALING" | "MUCKING" | "SUPPORTING" | "FACE_DRILLING" | "CHARGING" | "BLASTED_VENTING";
  assignedMachine: string;
  assignedMate: string;
  targetMeters: number;
  actualMeters: number;
  targetTonnes?: number;
  actualTonnes?: number;
  coldFaceIdleMins: number;
  gasClearanceOk: boolean;
  upcomingShiftPlan?: {
    shiftCode: "A" | "B" | "C";
    plannedTask: string;
    plannedMeters: number;
    plannedTonnes: number;
    assignedMachine: string;
    assignedOperator: string;
    priority: TaskPriority;
  };
}


interface RealBreakdownEvent {
  id: number;
  machineCode: string;
  category: "PNEUMATIC_WATER" | "CHUTE_CRUSHER_JAM" | "RAMP_CHOKE" | "HYDRAULIC_HOSE" | "VENT_FUMES";
  levelRl: number;
  reportedBy: string;
  desc: string;
  delayMins: number;
  etr: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  escalationTier: "LEVEL_MATE" | "SHIFT_INCHARGE" | "MINE_MANAGER";
  resolved: boolean;
}


interface EarlyWarningAlert {
  id: string;
  assetCode: string;
  oem: OEMVendor;
  parameter: string;
  observedValue: string;
  threshold: string;
  riskDescription: string;
  severity: "CRITICAL" | "WARNING";
}


interface SseConnection {
  id: number;
  userId: string;
  res: Response;
  role: Role;
}


interface ShiftProductionRecord {
  shiftCode: "A" | "B" | "C";
  shiftName: string;
  startTime: string;
  endTime: string;
  lockoutTime: string;
  drilledMeters: number;
  muckedTonnes: number;
  skipsHoisted: number;
  breakdownMins: number;
  reportedBy: string;
  lastUpdated: string;
  isLocked: boolean;
}


interface TimelineEvent {
  time: number;
  timeStr: string;
  title: string;
  desc: string;
  type: "NORMAL" | "TRAFFIC" | "CRITICAL" | "DISPATCH";
}


interface HourlyIntervalData {
  hourNumber: number;
  label: string;
  planTonnes: number;
  actualTonnes: number;
  varianceTonnes: number;
  bottleneckDetected: string | null;
  recoveryAction: string | null;
}


interface SecondaryKpiSet {
  metalTaktPerPerson: { current: number; baseline: number; target: number; unit: string };
  physicalAvailabilityPct: { current: number; baseline: number; target: number; delta: string };
  equipmentUtilizationPct: { current: number; baseline: number; target: number; delta: string };
  faceUtilizationPct: { current: number; baseline: number; target: number; delta: string };
  lhdProductiveHours: { current: number; baseline: number; target: number; delta: string };
  truckProductiveHours: { current: number; baseline: number; target: number; delta: string };
  advanceCompliancePct: { current: number; baseline: number; target: number; delta: string };
  breakdownResponseMins: { current: number; baseline: number; target: number; delta: string };
  equipmentIdleTimeMins: { current: number; baseline: number; target: number; delta: string };
}


export interface ShiftLossTree {
  totalLostTonnes: number;
  breakdownLostTonnes: number;
  rampTrafficLostTonnes: number;
  crusherJamLostTonnes: number;
  workforceFatigueLostTonnes: number;
  unassignedFaceLostTonnes: number;
}


// ========================================================
// 2. EMBEDDED IN-MEMORY STORE
// ========================================================
const users: User[] = [
  { id: 1, name: "Anumulla Mallesh (Mine Manager)", tokenNo: "HZL-MM-01", email: "manager@hzl.com", password: "123", role: "admin" },
  { id: 2, name: "Dushyant Tailor (Shift Incharge)", tokenNo: "HZL-SIC-09", email: "incharge@hzl.com", password: "123", role: "shift_incharge" },
  { id: 3, name: "AAC Operations Deck", tokenNo: "AAC-BP-12", email: "bp@hzl.com", password: "123", role: "bp_incharge" },
  { id: 4, name: "Komatsu Field Service", tokenNo: "OEM-KM-88", email: "oem.komatsu@hzl.com", password: "123", role: "oem_rep", oemCompany: "Komatsu" },
  { id: 5, name: "CAT GCPL Support", tokenNo: "OEM-CAT-04", email: "oem.cat@hzl.com", password: "123", role: "oem_rep", oemCompany: "Caterpillar" },
  { id: 6, name: "Sandvik Underground Service", tokenNo: "OEM-SV-10", email: "oem.sandvik@hzl.com", password: "123", role: "oem_rep", oemCompany: "Sandvik" },
  { id: 7, name: "Foreman Section-North (430/418 mRL)", tokenNo: "HZL-FM-01", email: "foreman.north@hzl.com", password: "123", role: "foreman", section: "Upper North (430/418 mRL)" },
  { id: 8, name: "Foreman Section-South (265/228 mRL)", tokenNo: "HZL-FM-02", email: "foreman.south@hzl.com", password: "123", role: "foreman", section: "Lower South (265/228 mRL)" },
  { id: 9, name: "Rajendra Meena (Control Room Incharge)", tokenNo: "HZL-CR-01", email: "cr.reporting@hzl.com", password: "123", role: "control_room" }
];


let kpis: SecondaryKpiSet = {
  metalTaktPerPerson: { current: 52.6, baseline: 51.0, target: 60.0, unit: "T/person/yr" },
  physicalAvailabilityPct: { current: 84.8, baseline: 82.0, target: 87.0, delta: "+2.8%" },
  equipmentUtilizationPct: { current: 68.2, baseline: 61.0, target: 76.0, delta: "+7.2%" },
  faceUtilizationPct: { current: 71.5, baseline: 65.0, target: 80.0, delta: "+6.5%" },
  lhdProductiveHours: { current: 5.6, baseline: 5.1, target: 6.2, delta: "+9.8%" },
  truckProductiveHours: { current: 5.8, baseline: 5.2, target: 6.3, delta: "+11.5%" },
  advanceCompliancePct: { current: 91.2, baseline: 88.0, target: 95.0, delta: "+3.2%" },
  breakdownResponseMins: { current: 18.0, baseline: 26.0, target: 18.0, delta: "-30.7%" },
  equipmentIdleTimeMins: { current: 38.0, baseline: 52.0, target: 41.0, delta: "-26.9%" }
};


let hourlyPlanVsActual: HourlyIntervalData[] = [
  { hourNumber: 1, label: "16:00 - 17:00", planTonnes: 260, actualTonnes: 255, varianceTonnes: -5, bottleneckDetected: null, recoveryAction: "Normal steady operations" },
  { hourNumber: 2, label: "17:00 - 18:00", planTonnes: 265, actualTonnes: 270, varianceTonnes: 5, bottleneckDetected: null, recoveryAction: "Peak throughput on North haulage" },
  { hourNumber: 3, label: "18:00 - 19:00", planTonnes: 270, actualTonnes: 140, varianceTonnes: -130, bottleneckDetected: "Steering cylinder failure on CL-19 at 228 mRL Ramp", recoveryAction: "Divert ascending haulage via Passing Bay 228 bypass" },
  { hourNumber: 4, label: "19:00 - 20:00", planTonnes: 265, actualTonnes: 165, varianceTonnes: -100, bottleneckDetected: "Tramp rockbolt wedged in Primary Crusher feeder plate", recoveryAction: "Deploy hot-work gas cutter Munna to clear plate" },
  { hourNumber: 5, label: "20:00 - 21:00", planTonnes: 260, actualTonnes: 285, varianceTonnes: 25, bottleneckDetected: "Resolved via MIP Dispatch", recoveryAction: "Haulers GT 10 & EMT-1 rerouted to 265 mRL stope" },
  { hourNumber: 6, label: "21:00 - 22:00", planTonnes: 260, actualTonnes: 264, varianceTonnes: 4, bottleneckDetected: null, recoveryAction: "Shift takt recovering towards target" },
  { hourNumber: 7, label: "22:00 - 23:00", planTonnes: 260, actualTonnes: 100, varianceTonnes: -160, bottleneckDetected: "Underload haulage deficit on GT 11", recoveryAction: "Top-up re-spot at 418 mRL stope heading" },
  { hourNumber: 8, label: "23:00 - 00:00", planTonnes: 260, actualTonnes: 0, varianceTonnes: -260, bottleneckDetected: "Pending shift closeout", recoveryAction: "Prepare clean face handover" }
];


let shiftProductionRecords: ShiftProductionRecord[] = [
  {
    shiftCode: "A",
    shiftName: "Shift A (08:00 - 16:00)",
    startTime: "08:00",
    endTime: "16:00",
    lockoutTime: "17:00",
    drilledMeters: 142.5,
    muckedTonnes: 1820,
    skipsHoisted: 52,
    breakdownMins: 65,
    reportedBy: "Rajendra Meena (HZL-CR-01)",
    lastUpdated: "2026-10-02 16:15",
    isLocked: true
  },
  {
    shiftCode: "B",
    shiftName: "Shift B (16:00 - 00:00)",
    startTime: "16:00",
    endTime: "00:00",
    lockoutTime: "01:00",
    drilledMeters: 98.0,
    muckedTonnes: 1479,
    skipsHoisted: 39,
    breakdownMins: 217,
    reportedBy: "Rajendra Meena (HZL-CR-01)",
    lastUpdated: "2026-10-02 19:40",
    isLocked: false
  },
  {
    shiftCode: "C",
    shiftName: "Shift C (00:00 - 08:00)",
    startTime: "00:00",
    endTime: "08:00",
    lockoutTime: "09:00",
    drilledMeters: 0.0,
    muckedTonnes: 0,
    skipsHoisted: 0,
    breakdownMins: 0,
    reportedBy: "Pending Handover",
    lastUpdated: "2026-10-02 00:00",
    isLocked: false
  }
];


let workforce: Worker[] = [
  { tokenNo: 800002, name: "Dhaneshwar Bhuyan", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: -130, assignedAssetOrBeat: "Lower Section (-130/-155 mRL Beat)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 6.5 } },
  { tokenNo: 800003, name: "Laxman Singh Sarangdewot", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 265, assignedAssetOrBeat: "Stope Beat (265/280 mRL)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 12.0 } },
  { tokenNo: 800006, name: "Manas Ranjan Panda", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 430, assignedAssetOrBeat: "Upper Section (430/418 mRL Beat)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 4.2 } },
  { tokenNo: 800008, name: "Thakor Dixitsinh Pravinsinh", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 228, assignedAssetOrBeat: "Haulage Decline (228/187 mRL)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 8.1 } },
  { tokenNo: 800009, name: "Mahesh Choubisa", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "Shaft Bottom & Crusher Level", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 3.5 } },
  { tokenNo: 800011, name: "Satish Gandla", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "Crusher & Feeder Beat", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 5.0 } },
  { tokenNo: 800013, name: "Anil Kumar Rajbhar", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "WEEKLY_OFF", isInsideMine: false, fatigueRiskLevel: "LOW", teleRemoteEligible: false, productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800014, name: "Urati Naveen", designation: "Mining Mate", category: "STATUTORY_MATE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: -130, assignedAssetOrBeat: "Auxiliary Air/Water Beat", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 2.1 } },
  { tokenNo: 800019, name: "Jagat Kumar", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 187, assignedAssetOrBeat: "GT 10 (42T Hauler)", productivity: { tonnesMuckedShift: 412, drilledMetersShift: 0, benchmarkVariancePct: 8.4 } },
  { tokenNo: 800020, name: "Mukesh Gupta", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 187, assignedAssetOrBeat: "GT 11 (42T Hauler)", productivity: { tonnesMuckedShift: 388, drilledMetersShift: 0, benchmarkVariancePct: 4.1 } },
  { tokenNo: 800022, name: "Abdul Vajid Khan", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 265, assignedAssetOrBeat: "GT 15 (20T Hauler)", productivity: { tonnesMuckedShift: 520, drilledMetersShift: 0, benchmarkVariancePct: 11.2 } },
  { tokenNo: 800024, name: "Mahamad Rafi", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 418, assignedAssetOrBeat: "EMT-1 (30T Hauler)", productivity: { tonnesMuckedShift: 490, drilledMetersShift: 0, benchmarkVariancePct: 6.8 } },
  { tokenNo: 800031, name: "Kalu Ram Meena", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 187, assignedAssetOrBeat: "MT-5 (30T Hauler)", productivity: { tonnesMuckedShift: 405, drilledMetersShift: 0, benchmarkVariancePct: 5.2 } },
  { tokenNo: 800032, name: "Roop Singh", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 228, assignedAssetOrBeat: "EMT-5 (30T Hauler)", productivity: { tonnesMuckedShift: 375, drilledMetersShift: 0, benchmarkVariancePct: -2.1 } },
  { tokenNo: 800038, name: "Dilip Kumar", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 228, assignedAssetOrBeat: "CL-19 (10T Loader)", productivity: { tonnesMuckedShift: 210, drilledMetersShift: 0, benchmarkVariancePct: -14.5 } },
  { tokenNo: 800039, name: "Mohan Lal", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 265, assignedAssetOrBeat: "GL-8 (10T Loader)", productivity: { tonnesMuckedShift: 560, drilledMetersShift: 0, benchmarkVariancePct: 15.6 } },
  { tokenNo: 800042, name: "Ramji Patel", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 430, assignedAssetOrBeat: "CL-11 (7T Loader)", productivity: { tonnesMuckedShift: 480, drilledMetersShift: 0, benchmarkVariancePct: 7.9 } },
  { tokenNo: 800044, name: "Ganesh Gurjar", designation: "LHD/LPDT Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 418, assignedAssetOrBeat: "GL-14 (10T Loader)", productivity: { tonnesMuckedShift: 445, drilledMetersShift: 0, benchmarkVariancePct: 3.2 } },
  { tokenNo: 800045, name: "Rahul Soni", designation: "Jumbo Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 430, assignedAssetOrBeat: "MJ-4 (Dual-Boom Jumbo)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 84.5, benchmarkVariancePct: 12.6 } },
  { tokenNo: 800046, name: "Praveen Sharma", designation: "Jumbo Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "MJ-5 (Dual-Boom Jumbo)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 42.0, benchmarkVariancePct: -22.0 } },
  { tokenNo: 800047, name: "S. K. Pal", designation: "Drill Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 245, assignedAssetOrBeat: "Simba-9 (Longhole Rig)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 98.2, benchmarkVariancePct: 14.2 } },
  { tokenNo: 800048, name: "Suresh Chandra", designation: "Drill Operator", category: "HEMM_OPERATOR", shiftStatus: "SHORT_PUNCH", isInsideMine: true, shortPunchHoursLost: 3.2, fatigueRiskLevel: "HIGH_RISK", teleRemoteEligible: false, sublevelRl: 245, assignedAssetOrBeat: "PM-2 (Standby / FATIGUED)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 18.0, benchmarkVariancePct: -65.0 } },
  { tokenNo: 800050, name: "Vikas Meena", designation: "Drill Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "M2D-8 (Boomer M2D)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 76.0, benchmarkVariancePct: 9.5 } },
  { tokenNo: 800051, name: "Nand Kishore", designation: "Utility Operator", category: "HEMM_OPERATOR", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: false, sublevelRl: 250, assignedAssetOrBeat: "DB-1 (Diesel Bowser)", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 5.0 } },
  { tokenNo: 800101, name: "Manohar Lal", designation: "Fitter", category: "MAINTENANCE_TRADE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 228, assignedAssetOrBeat: "Hydraulics & Steering Rig", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800102, name: "Alok Sen", designation: "Fitter", category: "MAINTENANCE_TRADE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "Crusher Maintenance Team", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800105, name: "Deepak Sharma", designation: "Electrician", category: "MAINTENANCE_TRADE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "Main Substation & GEB Panels", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800107, name: "Jalam Singh", designation: "Electrician", category: "MAINTENANCE_TRADE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: -155, assignedAssetOrBeat: "Main Sump Dewatering Pumps", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800110, name: "Munna Gas Cutter", designation: "Welder", category: "MAINTENANCE_TRADE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "Feeder Plate Rockbolt Clearing", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800112, name: "Ghanshyam Lohar", designation: "Welder", category: "MAINTENANCE_TRADE", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 187, assignedAssetOrBeat: "Workshop Bucket Hardfacing", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800201, name: "Nitin Meena", designation: "Helper", category: "UG_CREW", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 430, assignedAssetOrBeat: "MJ-4 Jumbo Assistant", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800202, name: "Balu Ram", designation: "Helper", category: "UG_CREW", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 250, assignedAssetOrBeat: "MJ-5 Drill Assistant", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800205, name: "Shankar Lal", designation: "Helper", category: "UG_CREW", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 245, assignedAssetOrBeat: "Simba-9 Rod Handler", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800207, name: "Raju Gameti", designation: "Explosive Carrier", category: "UG_CREW", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 265, assignedAssetOrBeat: "Ring Blasting Magazine Dispatch", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } },
  { tokenNo: 800208, name: "Madan Rawat", designation: "Under Ground Worker", category: "UG_CREW", shiftStatus: "PRESENT", isInsideMine: true, fatigueRiskLevel: "LOW", teleRemoteEligible: true, sublevelRl: 280, assignedAssetOrBeat: "Vent Wall Brickwork & Grouting", productivity: { tonnesMuckedShift: 0, drilledMetersShift: 0, benchmarkVariancePct: 0 } }
];


function classifyDesignation(desig: string): Worker["category"] {
  const d = (desig || "").toLowerCase();
  if (d.includes("mate") || d.includes("mining engineer") || d.includes("supervisor")) return "STATUTORY_MATE";
  if (d.includes("operator") || d.includes("driver") || d.includes("jumbo") || d.includes("drill") || d.includes("lhdt") || d.includes("lpdt") || d.includes("hemm")) return "HEMM_OPERATOR";
  if (d.includes("fitter") || d.includes("electrician") || d.includes("technician") || d.includes("welder") || d.includes("mechanic") || d.includes("turner")) return "MAINTENANCE_TRADE";
  if (d.includes("bell") || d.includes("winder") || d.includes("winding")) return "SHAFT_CREW";
  if (d.includes("clerk") || d.includes("store") || d.includes("assistant") || d.includes("planner") || d.includes("hr")) return "ADMIN";
  return "UG_CREW";
}


// COMPLETE 40-PIECE EQUIPMENT FLEET ORGANIZED BY WHITEBOARD CATEGORIES
let fleet: Machine[] = [
  // 1) LPDT (11) - ZAWARMALA
  { id: 1, code: "GT 10", category: "LPDT", type: "LPDT", oem: "GHH", model: "MK42", nominalCapacity: 42, lastPayloadScan: 41.2, levelRl: 187, rampSlot: "PORTAL_HAUL", status: "active", statusReason: "Active haulage run @ Portal incline", lastStatusUpdate: "2026-10-02 19:15", gcDueDate: "2026-10-15", operator: "Jagat Kumar (800019)", engineRpm: 1850, transmissionTempC: 88, hydraulicBar: 180, teleRemoteReady: false, idleTimeMins: 14 },
  { id: 2, code: "GT 11", category: "LPDT", type: "LPDT", oem: "GHH", model: "MK42", nominalCapacity: 42, lastPayloadScan: 40.8, levelRl: 187, rampSlot: "PASSING_BAY_228", status: "active", statusReason: "Active haulage run", lastStatusUpdate: "2026-10-02 19:20", gcDueDate: "2026-10-18", operator: "Mukesh Gupta (800020)", engineRpm: 1920, transmissionTempC: 92, hydraulicBar: 185, teleRemoteReady: false, idleTimeMins: 22 },
  { id: 3, code: "GT 8", category: "LPDT", type: "LPDT", oem: "GHH", model: "MK42", nominalCapacity: 42, lastPayloadScan: 0.0, levelRl: 187, rampSlot: "WORKSHOP_187", status: "gc_due", statusReason: "250-Hr General Check Due (Odometer: 2,490 hrs)", lastStatusUpdate: "2026-10-02 18:30", gcDueDate: "2026-10-02", operator: "Unassigned (Awaiting GC Inspection)", engineRpm: 0, transmissionTempC: 45, hydraulicBar: 0, teleRemoteReady: false, subsystemAlert: "General Inspection & Filter Change Due", idleTimeMins: 60 },
  { id: 4, code: "GT 15", category: "LPDT", type: "LPDT", oem: "GHH", model: "MKA20", nominalCapacity: 20, lastPayloadScan: 19.5, levelRl: 265, rampSlot: "PASSING_BAY_245", status: "idle", statusReason: "Torque converter overheating >115°C, cooling in Passing Bay 245", lastStatusUpdate: "2026-10-02 19:10", gcDueDate: "2026-10-12", operator: "Abdul Vajid Khan (800022)", engineRpm: 680, transmissionTempC: 118, hydraulicBar: 190, teleRemoteReady: false, subsystemAlert: "Transmission Temp > 115°C", idleTimeMins: 45 },
  { id: 5, code: "EMT-1", category: "LPDT", type: "LPDT", oem: "Epiroc", model: "MT436B", nominalCapacity: 30, lastPayloadScan: 29.8, levelRl: 187, rampSlot: "RAMP_NORTH_UP", status: "active", statusReason: "North Ramp ascent steady", lastStatusUpdate: "2026-10-02 19:25", gcDueDate: "2026-10-22", operator: "Mahamad Rafi (800024)", engineRpm: 1800, transmissionTempC: 80, hydraulicBar: 190, teleRemoteReady: false, idleTimeMins: 10 },
  { id: 6, code: "EMT-5", category: "LPDT", type: "LPDT", oem: "Epiroc", model: "MT436B", nominalCapacity: 30, lastPayloadScan: 28.9, levelRl: 228, rampSlot: "PASSING_BAY_228", status: "active", statusReason: "Decline haulage cycle", lastStatusUpdate: "2026-10-02 19:18", gcDueDate: "2026-10-20", operator: "Roop Singh (800032)", engineRpm: 1910, transmissionTempC: 86, hydraulicBar: 188, teleRemoteReady: false, idleTimeMins: 19 },
  { id: 7, code: "EMT-7", category: "LPDT", type: "LPDT", oem: "Epiroc", model: "MT436B", nominalCapacity: 30, lastPayloadScan: 29.4, levelRl: 265, rampSlot: "PORTAL_HAUL", status: "active", statusReason: "Ore haulage to 250 Crusher", lastStatusUpdate: "2026-10-02 19:28", gcDueDate: "2026-10-24", operator: "Operator EMT-7", engineRpm: 1830, transmissionTempC: 82, hydraulicBar: 182, teleRemoteReady: false, idleTimeMins: 12 },
  { id: 8, code: "EMT-6", category: "LPDT", type: "LPDT", oem: "Epiroc", model: "MT436B", nominalCapacity: 30, lastPayloadScan: 0.0, levelRl: 187, status: "breakdown", statusReason: "Transmission low oil pressure warning; limp mode engaged", lastStatusUpdate: "2026-10-02 18:45", gcDueDate: "2026-10-08", operator: "Standby Workshop Tech", engineRpm: 0, transmissionTempC: 62, hydraulicBar: 35, teleRemoteReady: false, subsystemAlert: "Low Transmission Oil Pressure (<12 Bar)", idleTimeMins: 95 },
  { id: 9, code: "EMT-3", category: "LPDT", type: "LPDT", oem: "Epiroc", model: "MOMT2200", nominalCapacity: 22, lastPayloadScan: 0.0, levelRl: 187, status: "idle", statusReason: "Standby backup hauler at 187 Portal Yard", lastStatusUpdate: "2026-10-02 17:00", gcDueDate: "2026-10-25", operator: "Unassigned (Spare)", engineRpm: 0, transmissionTempC: 50, hydraulicBar: 0, teleRemoteReady: false, idleTimeMins: 180 },
  { id: 10, code: "MT-5", category: "LPDT", type: "LPDT", oem: "AAC", model: "MT436B", nominalCapacity: 30, lastPayloadScan: 29.7, levelRl: 187, rampSlot: "RAMP_NORTH_UP", status: "active", statusReason: "Ascending to 430 mRL stope", lastStatusUpdate: "2026-10-02 19:32", gcDueDate: "2026-10-28", operator: "Kalu Ram Meena (800031)", engineRpm: 1840, transmissionTempC: 83, hydraulicBar: 186, teleRemoteReady: false, idleTimeMins: 8 },
  { id: 11, code: "MT-6", category: "LPDT", type: "LPDT", oem: "AAC", model: "MT436B", nominalCapacity: 30, lastPayloadScan: 28.5, levelRl: 265, rampSlot: "PORTAL_HAUL", status: "active", statusReason: "Haulage from 265 mRL Drawpoint", lastStatusUpdate: "2026-10-02 19:22", gcDueDate: "2026-10-29", operator: "Operator MT-6", engineRpm: 1860, transmissionTempC: 85, hydraulicBar: 184, teleRemoteReady: false, idleTimeMins: 15 },


  // 2) LHD (7)
  { id: 12, code: "GL-8", category: "LHD", type: "LHD", oem: "GHH", model: "LF10", nominalCapacity: 10, lastPayloadScan: 10.1, levelRl: 265, status: "active", statusReason: "Teleremote mucking from 265 open stope", lastStatusUpdate: "2026-10-02 19:30", gcDueDate: "2026-10-16", operator: "Mohan Lal (800039)", engineRpm: 1950, transmissionTempC: 85, hydraulicBar: 205, teleRemoteReady: true, idleTimeMins: 12 },
  { id: 13, code: "GL-14", category: "LHD", type: "LHD", oem: "GHH", model: "LF10", nominalCapacity: 10, lastPayloadScan: 9.8, levelRl: 418, status: "active", statusReason: "Development face mucking @ 418-EXT-02", lastStatusUpdate: "2026-10-02 19:20", gcDueDate: "2026-10-19", operator: "Ganesh Gurjar (800044)", engineRpm: 2050, transmissionTempC: 81, hydraulicBar: 195, teleRemoteReady: false, idleTimeMins: 18 },
  { id: 14, code: "GL-9", category: "LHD", type: "LHD", oem: "GHH", model: "LF14", nominalCapacity: 14, lastPayloadScan: 13.9, levelRl: 430, status: "active", statusReason: "Mucking waste rock to re-pass", lastStatusUpdate: "2026-10-02 19:27", gcDueDate: "2026-10-21", operator: "Operator GL-9", engineRpm: 2000, transmissionTempC: 83, hydraulicBar: 200, teleRemoteReady: true, idleTimeMins: 11 },
  { id: 15, code: "CL-11", category: "LHD", type: "LHD", oem: "Gainwell", model: "R1300G", nominalCapacity: 7, lastPayloadScan: 6.9, levelRl: 430, status: "active", statusReason: "Face cleanup @ 430 mRL drive", lastStatusUpdate: "2026-10-02 19:35", gcDueDate: "2026-10-26", operator: "Ramji Patel (800042)", engineRpm: 2100, transmissionTempC: 82, hydraulicBar: 200, teleRemoteReady: false, idleTimeMins: 5 },
  { id: 16, code: "CL-19", category: "LHD", type: "LHD", oem: "Gainwell", model: "R1600H", nominalCapacity: 10, lastPayloadScan: 0.0, levelRl: 228, status: "breakdown", statusReason: "Steering cylinder eye sheared @ 228 mRL decline ramp; stalls bypass", lastStatusUpdate: "2026-10-02 17:40", gcDueDate: "2026-10-10", operator: "Dilip Kumar (800038)", engineRpm: 0, transmissionTempC: 75, hydraulicBar: 38, teleRemoteReady: true, subsystemAlert: "Steering Eye Sheared & Pressure Fluctuations", idleTimeMins: 125 },
  { id: 17, code: "CL-23", category: "LHD", type: "LHD", oem: "Gainwell", model: "R1600H", nominalCapacity: 10, lastPayloadScan: 0.0, levelRl: 418, status: "idle", statusReason: "Awaiting face gas clearance at 418 heading", lastStatusUpdate: "2026-10-02 18:50", gcDueDate: "2026-10-27", operator: "Standby Operator CL-23", engineRpm: 700, transmissionTempC: 65, hydraulicBar: 160, teleRemoteReady: true, idleTimeMins: 55 },
  { id: 18, code: "SL-01", category: "LHD", type: "LHD", oem: "Sandvik", model: "LH517i", nominalCapacity: 17, lastPayloadScan: 16.8, levelRl: -130, status: "active", statusReason: "Deep level high-capacity stope mucking", lastStatusUpdate: "2026-10-02 19:15", gcDueDate: "2026-10-30", operator: "Operator SL-01", engineRpm: 2050, transmissionTempC: 84, hydraulicBar: 210, teleRemoteReady: true, idleTimeMins: 7 },


  // 3) DRILLS (8)
  { id: 19, code: "MJ-4", category: "DRILL", type: "JUMBO", oem: "GHH", model: "FM2.3", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 430, status: "active", statusReason: "Drilling blast round face holes @ 430-DEV-01", lastStatusUpdate: "2026-10-02 19:20", gcDueDate: "2026-10-14", operator: "Rahul Soni (800045)", engineRpm: 1600, transmissionTempC: 70, hydraulicBar: 220, teleRemoteReady: false, idleTimeMins: 25 },
  { id: 20, code: "MJ-5", category: "DRILL", type: "JUMBO", oem: "GHH", model: "FM2.3", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 250, status: "breakdown", statusReason: "Right boom feed hose burst during face scaling", lastStatusUpdate: "2026-10-02 18:15", gcDueDate: "2026-10-05", operator: "Praveen Sharma (800046)", engineRpm: 0, transmissionTempC: 65, hydraulicBar: 40, teleRemoteReady: false, subsystemAlert: "Right Boom Feed Hose Burst", idleTimeMins: 92 },
  { id: 21, code: "PM-2", category: "DRILL", type: "PROD_DRILL", oem: "GHH", model: "PM2.3", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 245, status: "idle", statusReason: "Air feed header starved <3.5 bar, operator short-punch", lastStatusUpdate: "2026-10-02 17:30", gcDueDate: "2026-10-11", operator: "Unassigned (Short-Punch 800048)", engineRpm: 0, transmissionTempC: 60, hydraulicBar: 15, teleRemoteReady: false, subsystemAlert: "Air Pressure < 4 Bar", idleTimeMins: 145 },
  { id: 22, code: "M2D-8", category: "DRILL", type: "JUMBO", oem: "Epiroc", model: "Boomer M2D", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 250, status: "active", statusReason: "Double-boom drive development drilling", lastStatusUpdate: "2026-10-02 19:25", gcDueDate: "2026-10-23", operator: "Vikas Meena (800050)", engineRpm: 1650, transmissionTempC: 72, hydraulicBar: 215, teleRemoteReady: false, idleTimeMins: 16 },
  { id: 23, code: "M2D-16", category: "DRILL", type: "JUMBO", oem: "Epiroc", model: "Boomer M2D", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 250, status: "maintenance", statusReason: "Workshop 250: Scheduled replacement of carrier drill control cards", lastStatusUpdate: "2026-10-02 16:30", gcDueDate: "2026-10-03", operator: "Workshop Electrical Crew", engineRpm: 0, transmissionTempC: 40, hydraulicBar: 0, teleRemoteReady: false, idleTimeMins: 190 },
  { id: 24, code: "Simba-6", category: "DRILL", type: "PROD_DRILL", oem: "Epiroc", model: "Simba E70S", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 265, status: "gc_due", statusReason: "Percussion Rockdrill 500-Hr General Check & Diaphragm Inspection Due", lastStatusUpdate: "2026-10-02 17:50", gcDueDate: "2026-10-02", operator: "Standby Drill Crew", engineRpm: 0, transmissionTempC: 52, hydraulicBar: 80, teleRemoteReady: false, subsystemAlert: "Statutory 500-Hr GC Overdue", idleTimeMins: 110 },
  { id: 25, code: "Simba-9", category: "DRILL", type: "PROD_DRILL", oem: "Epiroc", model: "Simba E70S", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 245, status: "active", statusReason: "Longhole ring production drilling (Ring 42/43)", lastStatusUpdate: "2026-10-02 19:35", gcDueDate: "2026-10-27", operator: "S. K. Pal (800047)", engineRpm: 1750, transmissionTempC: 72, hydraulicBar: 210, teleRemoteReady: false, idleTimeMins: 16 },
  { id: 26, code: "SJ-01", category: "DRILL", type: "JUMBO", oem: "AAC", model: "DD321-C", nominalCapacity: 0, lastPayloadScan: 0, levelRl: -130, status: "active", statusReason: "Sandvik double-boom drive advance @ -130 level", lastStatusUpdate: "2026-10-02 19:10", gcDueDate: "2026-10-25", operator: "AAC Jumbo Master", engineRpm: 1700, transmissionTempC: 74, hydraulicBar: 220, teleRemoteReady: false, idleTimeMins: 20 },


  // 4) UTILITIES AND SERVICES (8)
  { id: 27, code: "SL-1", category: "UTILITY", type: "UTILITY", oem: "GHH", model: "MV-U80D-SL", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 418, status: "breakdown", statusReason: "Platform hydraulic solenoid valve stuck; basket will not raise", lastStatusUpdate: "2026-10-02 18:20", gcDueDate: "2026-10-09", operator: "Roof Support Crew", engineRpm: 0, transmissionTempC: 55, hydraulicBar: 45, teleRemoteReady: false, subsystemAlert: "Solenoid Valve Failure", idleTimeMins: 75 },
  { id: 28, code: "CM-6", category: "UTILITY", type: "UTILITY", oem: "GHH", model: "BEC 100", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 250, status: "active", statusReason: "Nitrogen accumulator charging in main workshop", lastStatusUpdate: "2026-10-02 19:00", gcDueDate: "2026-10-20", operator: "Maintenance Tech CM-6", engineRpm: 1200, transmissionTempC: 60, hydraulicBar: 150, teleRemoteReady: false, idleTimeMins: 30 },
  { id: 29, code: "DB-1", category: "UTILITY", type: "SERVICE", oem: "GHH", model: "UVB-40D", nominalCapacity: 4, lastPayloadScan: 3.8, levelRl: 250, status: "idle", statusReason: "Staged at 250 fuel bay awaiting next mobile refueling cycle", lastStatusUpdate: "2026-10-02 18:40", gcDueDate: "2026-10-18", operator: "Nand Kishore (800051)", engineRpm: 800, transmissionTempC: 62, hydraulicBar: 140, teleRemoteReady: false, idleTimeMins: 40 },
  { id: 30, code: "EC-1", category: "UTILITY", type: "SERVICE", oem: "GHH", model: "MV-UBD-AC", nominalCapacity: 2, lastPayloadScan: 1.5, levelRl: 265, status: "active", statusReason: "Explosive transport to Ring Blasting face", lastStatusUpdate: "2026-10-02 19:15", gcDueDate: "2026-10-22", operator: "Raju Gameti (800207)", engineRpm: 1400, transmissionTempC: 68, hydraulicBar: 160, teleRemoteReady: false, idleTimeMins: 15 },
  { id: 31, code: "RBC", category: "UTILITY", type: "UTILITY", oem: "Normet", model: "RBO", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 430, status: "active", statusReason: "Shotcreting rebars and rockbolt installation", lastStatusUpdate: "2026-10-02 19:25", gcDueDate: "2026-10-24", operator: "Normet Spray Tech", engineRpm: 1550, transmissionTempC: 75, hydraulicBar: 190, teleRemoteReady: false, idleTimeMins: 10 },
  { id: 32, code: "PC-6", category: "UTILITY", type: "SERVICE", oem: "Normet", model: "UTIMEC MF 328 PER", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 187, status: "gc_due", statusReason: "Statutory Steering & Brakes GC Due under DGMS Circular 04", lastStatusUpdate: "2026-10-02 17:15", gcDueDate: "2026-10-02", operator: "Shaft Bottom Driver", engineRpm: 0, transmissionTempC: 50, hydraulicBar: 70, teleRemoteReady: false, subsystemAlert: "Mandatory DGMS Safety GC Due", idleTimeMins: 130 },
  { id: 33, code: "SL-3", category: "UTILITY", type: "UTILITY", oem: "Normet", model: "UTILIFT M-330", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 265, status: "active", statusReason: "Ventilation ducting suspension and cable hanging", lastStatusUpdate: "2026-10-02 19:18", gcDueDate: "2026-10-21", operator: "Vent Support Operator", engineRpm: 1500, transmissionTempC: 71, hydraulicBar: 175, teleRemoteReady: false, idleTimeMins: 14 },
  { id: 34, code: "PCP-5", category: "UTILITY", type: "SERVICE", oem: "Gainwell", model: "PAUS UNI50-3 PK", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 228, status: "active", statusReason: "Transporting shift relief crew to lower sublevels", lastStatusUpdate: "2026-10-02 19:30", gcDueDate: "2026-10-29", operator: "PCP Driver", engineRpm: 1600, transmissionTempC: 73, hydraulicBar: 165, teleRemoteReady: false, idleTimeMins: 8 },


  // ADDITIONAL EQUIPMENTS (6)
  { id: 35, code: "BL-01", category: "ADDITIONAL", type: "UTILITY", oem: "AAC", model: "Backhoe Loader JCB", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 250, status: "active", statusReason: "Clearing sump silt & drain ditches @ 250 Level", lastStatusUpdate: "2026-10-02 19:05", gcDueDate: "2026-10-23", operator: "JCB Operator 01", engineRpm: 1650, transmissionTempC: 76, hydraulicBar: 185, teleRemoteReady: false, idleTimeMins: 20 },
  { id: 36, code: "BL-02", category: "ADDITIONAL", type: "ADDITIONAL", oem: "AAC", model: "Backhoe Loader JCB", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 187, status: "gc_due", statusReason: "Backhoe Kingpost & Stabilizer Bushing GC Due", lastStatusUpdate: "2026-10-02 18:00", gcDueDate: "2026-10-02", operator: "Awaiting Inspection", engineRpm: 0, transmissionTempC: 45, hydraulicBar: 0, teleRemoteReady: false, subsystemAlert: "Stabilizer Bushing Wear Overdue", idleTimeMins: 85 },
  { id: 37, code: "HYDR-01", category: "ADDITIONAL", type: "ADDITIONAL", oem: "AAC", model: "HYDR. Crane Escorts", nominalCapacity: 12, lastPayloadScan: 0, levelRl: 187, status: "active", statusReason: "Heavy machinery component offloading at surface portal", lastStatusUpdate: "2026-10-02 19:10", gcDueDate: "2026-10-26", operator: "Crane Rigger AAC", engineRpm: 1400, transmissionTempC: 69, hydraulicBar: 190, teleRemoteReady: false, idleTimeMins: 35 },
  { id: 38, code: "ANBLER", category: "ADDITIONAL", type: "HV", oem: "MZL", model: "ANBLER (MON...)", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 228, status: "active", statusReason: "Supervisory inspection in decline south", lastStatusUpdate: "2026-10-02 19:22", gcDueDate: "2026-10-30", operator: "Foreman Section-South (HZL-FM-02)", engineRpm: 1500, transmissionTempC: 70, hydraulicBar: 0, teleRemoteReady: false, idleTimeMins: 12 },
  { id: 39, code: "ISUZU-4WD", category: "ADDITIONAL", type: "HV", oem: "Isuzu", model: "V-Cross 4WD AT Z PREST.", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 187, status: "active", statusReason: "Mine Manager emergency inspection vehicle (Ready)", lastStatusUpdate: "2026-10-02 19:35", gcDueDate: "2026-11-05", operator: "Anumulla Mallesh (HZL-MM-01)", engineRpm: 1200, transmissionTempC: 65, hydraulicBar: 0, teleRemoteReady: false, idleTimeMins: 45 },
  { id: 40, code: "AMBULANCE", category: "ADDITIONAL", type: "HV", oem: "MZL", model: "Ambulance Mining Spec", nominalCapacity: 0, lastPayloadScan: 0, levelRl: 187, status: "ok", statusReason: "Emergency Medical Response Vehicle - Standby 100% Ready", lastStatusUpdate: "2026-10-02 19:40", gcDueDate: "2026-11-15", operator: "First Aid Paramedic", engineRpm: 0, transmissionTempC: 40, hydraulicBar: 0, teleRemoteReady: false, idleTimeMins: 0 }
];


// COMPREHENSIVE BREAKDOWN & STATUS LOG LEDGER
let breakdownLogs: MachineBreakdownLog[] = [
  {
    id: "LOG-101",
    machineCode: "CL-19",
    machineCategory: "LHD",
    machineModel: "R1600H (10T)",
    oem: "Gainwell",
    status: "breakdown",
    reason: "Steering cylinder eye sheared; loader stalled blocking 228 mRL decline ramp bypass.",
    reasonCategory: "MECHANICAL",
    levelRl: 228,
    reportedBy: "Mahesh Babu (MM)",
    reportedAt: "2026-10-02 17:40",
    delayMins: 52,
    etr: "30 mins",
    severity: "CRITICAL",
    escalationTier: "MINE_MANAGER",
    actionTaken: "Bypass traffic diverted to Passing Bay 228; heavy towing rig dispatched.",
    resolved: false
  },
  {
    id: "LOG-102",
    machineCode: "MJ-5",
    machineCategory: "DRILL",
    machineModel: "FM2.3 (Dual Boom Jumbo)",
    oem: "GHH",
    status: "breakdown",
    reason: "Right boom feed cylinder adaptor burst during face scaling.",
    reasonCategory: "HYDRAULIC",
    levelRl: 250,
    reportedBy: "Satish mm",
    reportedAt: "2026-10-02 18:15",
    delayMins: 85,
    etr: "1 hr",
    severity: "HIGH",
    escalationTier: "MINE_MANAGER",
    actionTaken: "Fitter Manohar Lal mobilized with high-pressure SAE 100R12 hose assembly.",
    resolved: false
  },
  {
    id: "LOG-103",
    machineCode: "EMT-6",
    machineCategory: "LPDT",
    machineModel: "MT436B (30T)",
    oem: "Epiroc",
    status: "breakdown",
    reason: "Transmission oil pressure sensor triggered alarm below 12 Bar; limp mode engaged.",
    reasonCategory: "TRANSMISSION",
    levelRl: 187,
    reportedBy: "Control Room Incharge",
    reportedAt: "2026-10-02 18:45",
    delayMins: 40,
    etr: "45 mins",
    severity: "HIGH",
    escalationTier: "SHIFT_INCHARGE",
    actionTaken: "Hauler escorted to 187 Workshop bay for filter check and pressure test.",
    resolved: false
  },
  {
    id: "LOG-104",
    machineCode: "SL-1",
    machineCategory: "UTILITY",
    machineModel: "MV-U80D-SL (Scissor Lift)",
    oem: "GHH",
    status: "breakdown",
    reason: "Platform hydraulic solenoid valve stuck; basket unable to elevate for roof bolting.",
    reasonCategory: "HYDRAULIC",
    levelRl: 418,
    reportedBy: "Foreman North",
    reportedAt: "2026-10-02 18:20",
    delayMins: 35,
    etr: "20 mins",
    severity: "MEDIUM",
    escalationTier: "SHIFT_INCHARGE",
    actionTaken: "Solenoid coil resistance tested; spare coil dispatched from stores.",
    resolved: false
  },
  {
    id: "LOG-105",
    machineCode: "GT 8",
    machineCategory: "LPDT",
    machineModel: "MK42 (42T)",
    oem: "GHH",
    status: "gc_due",
    reason: "250-Hour General Check Due (Odometer: 2,490 hrs). Mandatory engine & lube service.",
    reasonCategory: "GENERAL_CHECK",
    levelRl: 187,
    reportedBy: "Fleet Maintenance Planner",
    reportedAt: "2026-10-02 18:30",
    delayMins: 60,
    etr: "1.5 hrs",
    severity: "MEDIUM",
    escalationTier: "SHIFT_INCHARGE",
    actionTaken: "Scheduled for Shift C workshop service slot.",
    resolved: false
  },
  {
    id: "LOG-106",
    machineCode: "Simba-6",
    machineCategory: "DRILL",
    machineModel: "Simba E70S (Production Drill)",
    oem: "Epiroc",
    status: "gc_due",
    reason: "Percussion Rockdrill 500-Hr General Check & Diaphragm Inspection Due.",
    reasonCategory: "GENERAL_CHECK",
    levelRl: 265,
    reportedBy: "OEM Epiroc Lead",
    reportedAt: "2026-10-02 17:50",
    delayMins: 110,
    etr: "2 hrs",
    severity: "MEDIUM",
    escalationTier: "SHIFT_INCHARGE",
    actionTaken: "Drill rods pulled and staged; OEM service kit pre-staged.",
    resolved: false
  },
  {
    id: "LOG-107",
    machineCode: "PC-6",
    machineCategory: "UTILITY",
    machineModel: "UTIMEC MF 328 PER",
    oem: "Normet",
    status: "gc_due",
    reason: "Statutory Steering & Brakes GC Due under DGMS Circular 04.",
    reasonCategory: "GENERAL_CHECK",
    levelRl: 187,
    reportedBy: "DGMS Compliance Officer",
    reportedAt: "2026-10-02 17:15",
    delayMins: 130,
    etr: "40 mins",
    severity: "HIGH",
    escalationTier: "MINE_MANAGER",
    actionTaken: "Brake retarder test rig calibrated in workshop.",
    resolved: false
  },
  {
    id: "LOG-108",
    machineCode: "BL-02",
    machineCategory: "ADDITIONAL",
    machineModel: "Backhoe Loader JCB",
    oem: "AAC",
    status: "gc_due",
    reason: "Backhoe Kingpost & Stabilizer Bushing GC Due.",
    reasonCategory: "GENERAL_CHECK",
    levelRl: 187,
    reportedBy: "AAC Mechanical Incharge",
    reportedAt: "2026-10-02 18:00",
    delayMins: 85,
    etr: "1 hr",
    severity: "LOW",
    escalationTier: "LEVEL_MATE",
    actionTaken: "Staged at AAC service yard.",
    resolved: false
  },
  {
    id: "LOG-109",
    machineCode: "GT 15",
    machineCategory: "LPDT",
    machineModel: "MKA20 (20T)",
    oem: "GHH",
    status: "idle",
    reason: "Torque converter overheating >115°C, staged in Passing Bay 245 for cooldown.",
    reasonCategory: "IDLE_OPERATIONAL",
    levelRl: 265,
    reportedBy: "Abdul Vajid Khan (Operator)",
    reportedAt: "2026-10-02 19:10",
    delayMins: 45,
    etr: "15 mins",
    severity: "MEDIUM",
    escalationTier: "LEVEL_MATE",
    actionTaken: "Engine idling at low RPM; temperature dropping towards 95°C normal.",
    resolved: false
  },
  {
    id: "LOG-110",
    machineCode: "PM-2",
    machineCategory: "DRILL",
    machineModel: "PM2.3 (Production Drill)",
    oem: "GHH",
    status: "idle",
    reason: "Air feed header starved <3.5 bar, operator short-punch fatigue lockout.",
    reasonCategory: "PNEUMATIC",
    levelRl: 245,
    reportedBy: "Sundar Soni",
    reportedAt: "2026-10-02 17:30",
    delayMins: 145,
    etr: "25 mins",
    severity: "HIGH",
    escalationTier: "SHIFT_INCHARGE",
    actionTaken: "Adit air line rupture patched; waiting for relief operator assignment.",
    resolved: false
  }
];


let faces: HeadingFace[] = [
  { id: "430-DEV-01", levelRl: 430, cycleState: "SUPPORTING", assignedMachine: "MJ-4", assignedMate: "Manas Ranjan Panda", targetMeters: 4.2, actualMeters: 3.8, targetTonnes: 320, actualTonnes: 290, coldFaceIdleMins: 12, gasClearanceOk: true, upcomingShiftPlan: { shiftCode: "C", plannedTask: "Face Drilling & Blasting", plannedMeters: 4.5, plannedTonnes: 350, assignedMachine: "MJ-4", assignedOperator: "Rahul Soni (800045)", priority: "CRITICAL_P1" } },
  { id: "418-EXT-02", levelRl: 418, cycleState: "MUCKING", assignedMachine: "GL-14", assignedMate: "Manas Ranjan Panda", targetMeters: 3.8, actualMeters: 3.6, targetTonnes: 280, actualTonnes: 265, coldFaceIdleMins: 42, gasClearanceOk: true, upcomingShiftPlan: { shiftCode: "C", plannedTask: "Continuous LHD Mucking to Ore-pass", plannedMeters: 3.8, plannedTonnes: 310, assignedMachine: "GL-14", assignedOperator: "Ganesh Gurjar (800044)", priority: "HIGH_P2" } },
  { id: "250-DRIVE-R", levelRl: 250, cycleState: "FACE_DRILLING", assignedMachine: "M2D-8", assignedMate: "Mahesh Choubisa", targetMeters: 4.0, actualMeters: 1.8, targetTonnes: 300, actualTonnes: 140, coldFaceIdleMins: 45, gasClearanceOk: true, upcomingShiftPlan: { shiftCode: "C", plannedTask: "Complete Advance Round & Rockbolting", plannedMeters: 4.2, plannedTonnes: 320, assignedMachine: "M2D-8", assignedOperator: "Vikas Meena (800050)", priority: "CRITICAL_P1" } },
  { id: "-130-WEST-04", levelRl: -130, cycleState: "BLASTED_VENTING", assignedMachine: "SJ-01", assignedMate: "Dhaneshwar Bhuyan", targetMeters: 4.5, actualMeters: 4.1, targetTonnes: 380, actualTonnes: 350, coldFaceIdleMins: 62, gasClearanceOk: false, upcomingShiftPlan: { shiftCode: "C", plannedTask: "Post-Vent Gas Clearance & Teleremote Mucking", plannedMeters: 4.5, plannedTonnes: 380, assignedMachine: "SL-01", assignedOperator: "Surface Teleremote Chair", priority: "CRITICAL_P1" } },
  { id: "265-EAST-01", levelRl: 265, cycleState: "MUCKING", assignedMachine: "GL-8", assignedMate: "Laxman Singh Sarangdewot", targetMeters: 4.0, actualMeters: 3.9, targetTonnes: 450, actualTonnes: 430, coldFaceIdleMins: 15, gasClearanceOk: true, upcomingShiftPlan: { shiftCode: "C", plannedTask: "Stope Drawpoint Production Mucking", plannedMeters: 0.0, plannedTonnes: 520, assignedMachine: "GL-8", assignedOperator: "Mohan Lal (800039)", priority: "CRITICAL_P1" } },
  { id: "187-DECLINE-03", levelRl: 187, cycleState: "SUPPORTING", assignedMachine: "RBC", assignedMate: "Thakor Dixitsinh", targetMeters: 3.5, actualMeters: 3.2, targetTonnes: 200, actualTonnes: 185, coldFaceIdleMins: 20, gasClearanceOk: true, upcomingShiftPlan: { shiftCode: "C", plannedTask: "Decline Deepening Face Drilling", plannedMeters: 3.5, plannedTonnes: 210, assignedMachine: "SJ-01", assignedOperator: "AAC Jumbo Master", priority: "HIGH_P2" } }
];


let rawBreakdowns: RealBreakdownEvent[] = [
  { id: 101, machineCode: "CL-19", category: "RAMP_CHOKE", levelRl: 228, reportedBy: "Mahesh Babu (MM)", desc: "Steering cylinder eye sheared; loader stalled blocking 228 mRL decline ramp.", delayMins: 52, etr: "30 mins", severity: "CRITICAL", escalationTier: "MINE_MANAGER", resolved: false },
  { id: 102, machineCode: "PRIMARY_CRUSHER", category: "CHUTE_CRUSHER_JAM", levelRl: 250, reportedBy: "Basant Ji", desc: "Tramp iron / rockbolt stuck in underground primary crusher feeder plate.", delayMins: 38, etr: "12 mins", severity: "CRITICAL", escalationTier: "SHIFT_INCHARGE", resolved: false },
  { id: 103, machineCode: "PM-2", category: "PNEUMATIC_WATER", levelRl: 245, reportedBy: "Sundar Soni", desc: "Compressed air header dropped to 3.2 bar due to adit line rupture.", delayMins: 42, etr: "25 mins", severity: "HIGH", escalationTier: "SHIFT_INCHARGE", resolved: false },
  { id: 104, machineCode: "MJ-5", category: "HYDRAULIC_HOSE", levelRl: 250, reportedBy: "Satish mm", desc: "Right boom feed cylinder adaptor burst during face scaling.", delayMins: 85, etr: "1 hr", severity: "HIGH", escalationTier: "MINE_MANAGER", resolved: false }
];


let tasks: UndergroundTask[] = [
  { id: "TSK-01", title: "Statutory Gas & Roof Testing at Upper Section", category: "STATUTORY_BEAT", shiftCode: "B", shiftTiming: "Shift B (16:00 - 00:00)", levelRl: 430, targetAssetOrFace: "430-DEV-01 & 418-EXT-02", priority: "CRITICAL_P1", requiredRole: "STATUTORY_MATE", isHazardousTeleremote: false, requestedBySection: "Upper North (430/418 mRL)", assignedTokenNo: 800006, assignedWorkerName: "Manas Ranjan Panda", status: "CONFIRMED" },
  { id: "TSK-02", title: "Teleremote Mucking from 265 mRL Open Stope", category: "HEMM_MUCKING", shiftCode: "B", shiftTiming: "Shift B (16:00 - 00:00)", levelRl: 265, targetAssetOrFace: "265-EAST-01", priority: "CRITICAL_P1", requiredRole: "HEMM_OPERATOR", isHazardousTeleremote: true, requestedBySection: "Lower South (265/228 mRL)", assignedTokenNo: 800039, assignedWorkerName: "Mohan Lal", assignedMachineCode: "GL-8", targetTonnes: 450, status: "CONFIRMED" },
  { id: "TSK-03", title: "Longhole Production Ring Drilling @ 245 mRL", category: "FACE_DRILL", shiftCode: "B", shiftTiming: "Shift B (16:00 - 00:00)", levelRl: 245, targetAssetOrFace: "Simba-9", priority: "HIGH_P2", requiredRole: "HEMM_OPERATOR", isHazardousTeleremote: false, requestedBySection: "Lower South (265/228 mRL)", assignedTokenNo: 800047, assignedWorkerName: "S. K. Pal", assignedMachineCode: "Simba-9", targetMeters: 98.0, status: "CONFIRMED" },
  { id: "TSK-04", title: "Decline Ramp Traffic Clearance & Haulage Tramming", category: "HEMM_MUCKING", shiftCode: "B", shiftTiming: "Shift B (16:00 - 00:00)", levelRl: 187, targetAssetOrFace: "GT 10 (42T Hauler)", priority: "HIGH_P2", requiredRole: "HEMM_OPERATOR", isHazardousTeleremote: false, requestedBySection: "Lower South (265/228 mRL)", assignedTokenNo: 800019, assignedWorkerName: "Jagat Kumar", assignedMachineCode: "GT 10", targetTonnes: 412, status: "CONFIRMED" },
  { id: "TSK-05", title: "Primary Crusher Tramp Iron Torch Cutting", category: "CRUSHER_FEED", shiftCode: "B", shiftTiming: "Shift B (16:00 - 00:00)", levelRl: 250, targetAssetOrFace: "PRIMARY_CRUSHER", priority: "CRITICAL_P1", requiredRole: "MAINTENANCE_TRADE", isHazardousTeleremote: false, requestedBySection: "Lower South (265/228 mRL)", assignedTokenNo: 800110, assignedWorkerName: "Munna Gas Cutter", status: "CONFIRMED" },


  // UPCOMING SHIFT C TASKS (PRE-POPULATED FOR TARGETED FACE PLANNING)
  { id: "TSK-UP-01", title: "Shift C: 430-DEV-01 Heading Blast Round Drilling", category: "FACE_DRILL", shiftCode: "C", shiftTiming: "Shift C (00:00 - 08:00)", levelRl: 430, targetAssetOrFace: "430-DEV-01", targetMeters: 4.5, targetTonnes: 0, priority: "CRITICAL_P1", requiredRole: "HEMM_OPERATOR", isHazardousTeleremote: false, assignedMachineCode: "MJ-4", assignedTokenNo: 800045, assignedWorkerName: "Rahul Soni", status: "CONFIRMED", notes: "Target 4.5m advance with 45mm burn cut" },
  { id: "TSK-UP-02", title: "Shift C: High-Capacity Deep Stope Mucking @ -130 Level", category: "HEMM_MUCKING", shiftCode: "C", shiftTiming: "Shift C (00:00 - 08:00)", levelRl: -130, targetAssetOrFace: "-130-WEST-04", targetMeters: 0, targetTonnes: 380, priority: "CRITICAL_P1", requiredRole: "HEMM_OPERATOR", isHazardousTeleremote: true, assignedMachineCode: "SL-01", assignedTokenNo: 800039, assignedWorkerName: "Mohan Lal", status: "CONFIRMED", notes: "Teleremote mucking once gas clearance OK" },
  { id: "TSK-UP-03", title: "Shift C: 250-DRIVE-R Heading Advance Completion", category: "FACE_DRILL", shiftCode: "C", shiftTiming: "Shift C (00:00 - 08:00)", levelRl: 250, targetAssetOrFace: "250-DRIVE-R", targetMeters: 4.2, targetTonnes: 0, priority: "HIGH_P2", requiredRole: "HEMM_OPERATOR", isHazardousTeleremote: false, assignedMachineCode: "M2D-8", assignedTokenNo: 800050, assignedWorkerName: "Vikas Meena", status: "CONFIRMED", notes: "Resume after MJ-5 breakdown diversion" },
  { id: "TSK-UP-04", title: "Shift C: Workshop 250-Hr GC on GT 8 & PC-6", category: "GENERAL_CHECK", shiftCode: "C", shiftTiming: "Shift C (00:00 - 08:00)", levelRl: 187, targetAssetOrFace: "GT 8", priority: "HIGH_P2", requiredRole: "MAINTENANCE_TRADE", isHazardousTeleremote: false, assignedMachineCode: "GT 8", assignedTokenNo: 800101, assignedWorkerName: "Manohar Lal", status: "CONFIRMED", notes: "Clear GC Due flags before Shift A restart" }
];


let conflicts: StatutoryConflict[] = [];


let metrics = {
  currentTakt: 52.6,
  targetTakt: 60.0,
  hoistShiftTonnes: 1479,
  targetShiftTonnes: 2100,
  cobBinPercentage: 29.6,
  developmentCompliancePct: 91.2,
  equipmentAvailabilityPct: 84.8,
  monteCarloProbability: 64.8,
  recoveryExecuted: false
};


let earlyWarnings: EarlyWarningAlert[] = [
  { id: "EW-01", assetCode: "GT 15", oem: "GHH", parameter: "Torque Converter Temp", observedValue: "118°C", threshold: ">105°C", riskDescription: "Converter slip under load on 265 mRL ramp. Imminent gear lock risk.", severity: "CRITICAL" },
  { id: "EW-02", assetCode: "CL-19", oem: "Gainwell", parameter: "Steering Pressure Delta", observedValue: "38 Bar", threshold: ">20 Bar", riskDescription: "Micro cavitation inside articulation manifold preceded cylinder eye stress failure.", severity: "CRITICAL" },
  { id: "EW-03", assetCode: "PM-2", oem: "GHH", parameter: "Air Feed Header", observedValue: "3.2 Bar", threshold: "<5.5 Bar", riskDescription: "Starvation stalling rotation motor during ring reaming.", severity: "WARNING" },
  { id: "EW-04", assetCode: "GT 8", oem: "GHH", parameter: "Engine Service Hours", observedValue: "2,490 hrs", threshold: "2,500 hrs", riskDescription: "250-hr periodic service interval due within 10 operating hours.", severity: "WARNING" }
];


let oemReliability = [
  { oem: "GHH", mtbfHours: 215.0, mttrMins: 68, availabilityPct: 88.5 },
  { oem: "Epiroc", mtbfHours: 228.0, mttrMins: 61, availabilityPct: 89.1 },
  { oem: "Gainwell", mtbfHours: 112.5, mttrMins: 92, availabilityPct: 78.4 },
  { oem: "Sandvik", mtbfHours: 230.0, mttrMins: 55, availabilityPct: 90.5 },
  { oem: "AAC", mtbfHours: 195.0, mttrMins: 75, availabilityPct: 86.0 },
  { oem: "Normet", mtbfHours: 210.0, mttrMins: 70, availabilityPct: 88.0 }
];


let crossShiftSummary = [
  { shift: "Shift A (08:00 - 16:00)", drilledMeters: 142.5, muckedTonnes: 1820, skipsHoisted: 52, breakdownMins: 65, taktAchieved: "58.4 T/person/yr" },
  { shift: "Shift B (16:00 - 00:00) [Current]", drilledMeters: 98.0, muckedTonnes: 1479, skipsHoisted: 39, breakdownMins: 217, taktAchieved: "52.6 -> 58.6 T (MIP Recovery)" },
  { shift: "Shift C (00:00 - 08:00) [Upcoming Planned]", drilledMeters: 135.0, muckedTonnes: 1750, skipsHoisted: 48, breakdownMins: 80, taktAchieved: "57.0 T/person/yr" }
];


let timelineEvents: TimelineEvent[] = [
  { time: 16.25, timeStr: "16:15", title: "Shift Handover & Turnstile Sync", desc: "434 personnel accounted. Turnstiles synchronized with statutory 434 register.", type: "NORMAL" },
  { time: 16.75, timeStr: "16:45", title: "Passing Bay Clearance", desc: "GT 15 held in Passing Bay 245 to permit portal clearance for ascending haulage convoy.", type: "TRAFFIC" },
  { time: 17.65, timeStr: "17:40", title: "CL-19 Articulation Breakdown", desc: "Steering cylinder eye sheared @ 228 mRL decline ramp; bypass traffic diverted.", type: "CRITICAL" },
  { time: 18.40, timeStr: "18:25", title: "Primary Crusher Rockbolt Jam", desc: "Tramp steel lodged in feeder plates. Gas cutter Munna mobilized with hot-work permit.", type: "CRITICAL" },
  { time: 19.50, timeStr: "19:30", title: "MIP Dynamic Dispatch Recovery", desc: "Haulers GT 10 & MT-5 rerouted to 265 mRL stope to maintain shift takt run-rate.", type: "DISPATCH" }
];


let activeSseClients: SseConnection[] = [];


// ========================================================
// 3. CORE ENGINES: LOSS TREE & ALLOCATION
// ========================================================
export function computeShiftLossTree(): ShiftLossTree {
  let breakdownLost = 0;
  let rampLost = 0;
  let crusherLost = 0;
  let workforceLost = 0;
  let faceLost = 0;


  const activeLogs = breakdownLogs.filter(b => !b.resolved && (b.status === "breakdown" || b.status === "gc_due"));
  activeLogs.forEach(b => {
    const lost = Math.round(b.delayMins * 2.5);
    if (b.reasonCategory === "CHUTE_CRUSHER" || b.machineCode === "PRIMARY_CRUSHER") crusherLost += lost;
    else if (b.machineCode === "CL-19" || b.reason.toLowerCase().includes("ramp") || b.reason.toLowerCase().includes("decline")) rampLost += lost;
    else breakdownLost += lost;
  });


  workforce.filter(w => w.shiftStatus === "SHORT_PUNCH").forEach(w => {
    workforceLost += Math.round((w.shortPunchHoursLost || 2) * 40);
  });


  faces.filter(f => f.gasClearanceOk && f.coldFaceIdleMins > 30).forEach(f => {
    faceLost += Math.round((f.coldFaceIdleMins / 60) * 45);
  });


  const totalLost = breakdownLost + rampLost + crusherLost + workforceLost + faceLost;
  return {
    totalLostTonnes: totalLost,
    breakdownLostTonnes: breakdownLost,
    rampTrafficLostTonnes: rampLost,
    crusherJamLostTonnes: crusherLost,
    workforceFatigueLostTonnes: workforceLost,
    unassignedFaceLostTonnes: faceLost
  };
}


function emitSse(event: string, payload: any) {
  const message = "event: " + event + "\ndata: " + JSON.stringify(payload) + "\n\n";
  const dead: number[] = [];
  activeSseClients.forEach(c => {
    try {
      if (c.res.writableEnded || c.res.destroyed) {
        dead.push(c.id);
        return;
      }
      c.res.write(message);
    } catch (_e) {
      dead.push(c.id);
    }
  });
  if (dead.length) {
    activeSseClients = activeSseClients.filter(c => !dead.includes(c.id));
  }
}


function broadcastPresence() {
  const uniqueUsers = new Set(activeSseClients.map(c => c.userId));
  emitSse("presence", { count: uniqueUsers.size || 1 });
}


function broadcastFullState() {
  emitSse("state_update", {
    fleet,
    breakdowns: rawBreakdowns,
    breakdownLogs,
    faces,
    metrics,
    kpis,
    hourlyPlanVsActual,
    workforce,
    tasks,
    conflicts,
    earlyWarnings,
    oemReliability,
    crossShiftSummary,
    shiftProductionRecords,
    timelineEvents,
    lossTree: computeShiftLossTree()
  });
}


export function recommendEffectiveAllocation(): {
  recommendations: Array<{ taskId: string; recommendedToken: number; name: string; rationale: string }>;
  unassignedTasks: string[];
} {
  const recommendations: Array<{ taskId: string; recommendedToken: number; name: string; rationale: string }> = [];
  const unassignedTasks: string[] = [];
  const assignedTokensSet = new Set<number>();


  const priorityWeight: Record<TaskPriority, number> = {
    CRITICAL_P1: 4,
    HIGH_P2: 3,
    MEDIUM_P3: 2,
    LOW_P4: 1
  };


  const sortedTasks = [...tasks].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);


  for (const t of sortedTasks) {
    const eligiblePool = workforce.filter(w => {
      if (!w.isInsideMine || w.shiftStatus !== "PRESENT") return false;
      if (w.category !== t.requiredRole) return false;
      if (assignedTokensSet.has(w.tokenNo)) return false;


      if (t.isHazardousTeleremote && (!w.teleRemoteEligible || w.fatigueRiskLevel === "HIGH_RISK")) {
        return false;
      }
      return true;
    });


    if (eligiblePool.length === 0) {
      unassignedTasks.push(t.id);
      continue;
    }


    eligiblePool.sort((a, b) => {
      const aDist = a.sublevelRl ? Math.abs(a.sublevelRl - t.levelRl) : 999;
      const bDist = b.sublevelRl ? Math.abs(b.sublevelRl - t.levelRl) : 999;
      if (aDist !== bDist) return aDist - bDist;
      return b.productivity.benchmarkVariancePct - a.productivity.benchmarkVariancePct;
    });


    const chosen = eligiblePool[0];
    assignedTokensSet.add(chosen.tokenNo);


    recommendations.push({
      taskId: t.id,
      recommendedToken: chosen.tokenNo,
      name: chosen.name,
      rationale: `Inside mine @ ${chosen.sublevelRl || t.levelRl} mRL, Fatigue: OK, Efficiency: +${chosen.productivity.benchmarkVariancePct}%`
    });
  }


  return { recommendations, unassignedTasks };
}


// ========================================================
// 4. GEMINI AI NATURAL LANGUAGE INTEGRATION
// ========================================================
async function callGeminiInteractions(prompt: string, systemInstruction: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }


  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }
    })
  });


  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }


  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini.");
  return text;
}


// ========================================================
// 5. API ROUTES & REPORTING ENGINE
// ========================================================
app.get("/api/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");


  const userId = String(req.query.userId || req.query.role || "unknown");
  const conn: SseConnection = {
    id: Date.now() + Math.floor(Math.random() * 1000000),
    userId,
    res,
    role: (req.query.role as Role) || "shift_incharge"
  };


  activeSseClients = activeSseClients.filter(c => c.userId !== userId);
  activeSseClients.push(conn);
  broadcastPresence();


  req.on("close", () => {
    activeSseClients = activeSseClients.filter(c => c.id !== conn.id);
    broadcastPresence();
  });
});


app.get("/api/state", (_req, res) => {
  res.json({
    fleet,
    breakdowns: rawBreakdowns,
    breakdownLogs,
    faces,
    metrics,
    kpis,
    hourlyPlanVsActual,
    workforce,
    tasks,
    conflicts,
    earlyWarnings,
    oemReliability,
    crossShiftSummary,
    shiftProductionRecords,
    timelineEvents,
    lossTree: computeShiftLossTree()
  });
});


app.get("/api/fleet", (_req, res) => {
  res.json({ fleet, total: fleet.length });
});


app.get("/api/breakdowns/logs", (req, res) => {
  let logs = [...breakdownLogs];
  const { status, category, machineCode, resolved } = req.query;
  if (status) logs = logs.filter(l => l.status === status);
  if (category) logs = logs.filter(l => l.machineCategory === category);
  if (machineCode) logs = logs.filter(l => l.machineCode.toLowerCase() === String(machineCode).toLowerCase());
  if (resolved !== undefined) logs = logs.filter(l => String(l.resolved) === String(resolved));
  res.json({ logs, count: logs.length });
});


app.post("/api/breakdowns/log", (req: Request, res: Response) => {
  const { machineCode, status, reason, reasonCategory, levelRl, delayMins, etr, severity, escalationTier, reportedBy } = req.body || {};
  if (!machineCode || !status) {
    return res.status(400).json({ error: "machineCode and status are required." });
  }


  const machine = fleet.find(m => m.code.toLowerCase() === String(machineCode).trim().toLowerCase());
  if (!machine) {
    return res.status(404).json({ error: `Machine ${machineCode} not found in fleet.` });
  }


  const validStatuses: MachineStatus[] = ["ok", "active", "idle", "breakdown", "gc_due", "maintenance"];
  const targetStatus = (status.toLowerCase() === "active" ? "active" : status.toLowerCase()) as MachineStatus;
  if (!validStatuses.includes(targetStatus)) {
    return res.status(400).json({ error: `Invalid status. Valid values: ${validStatuses.join(", ")}` });
  }


  machine.status = targetStatus;
  machine.statusReason = reason || `Status updated to ${targetStatus}`;
  machine.lastStatusUpdate = new Date().toISOString().replace("T", " ").substring(0, 16);
  if (levelRl) machine.levelRl = Number(levelRl);
  if (targetStatus === "breakdown") {
    machine.subsystemAlert = reason || "Machine breakdown reported";
  } else if (targetStatus === "active" || targetStatus === "ok") {
    machine.subsystemAlert = undefined;
    machine.idleTimeMins = 0;
  }


  const logId = "LOG-" + (breakdownLogs.length + 101).toString();
  const newLog: MachineBreakdownLog = {
    id: logId,
    machineCode: machine.code,
    machineCategory: machine.category,
    machineModel: machine.model,
    oem: machine.oem,
    status: targetStatus,
    reason: reason || `Machine status shifted to ${targetStatus}`,
    reasonCategory: (reasonCategory || "MECHANICAL") as ReasonCategory,
    levelRl: machine.levelRl,
    reportedBy: reportedBy || "Control Room / Shift Incharge",
    reportedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
    delayMins: Number(delayMins) || (targetStatus === "breakdown" ? 30 : 0),
    etr: etr || (targetStatus === "breakdown" ? "45 mins" : "--"),
    severity: (severity || (targetStatus === "breakdown" ? "HIGH" : "MEDIUM")),
    escalationTier: (escalationTier || "SHIFT_INCHARGE"),
    actionTaken: targetStatus === "breakdown" ? "Logged in breakdown register; mobile mechanic dispatched." : undefined,
    resolved: targetStatus === "active" || targetStatus === "ok"
  };


  breakdownLogs.unshift(newLog);


  if (targetStatus === "breakdown") {
    rawBreakdowns.push({
      id: Date.now(),
      machineCode: machine.code,
      category: (reasonCategory === "HYDRAULIC" ? "HYDRAULIC_HOSE" : reasonCategory === "PNEUMATIC" ? "PNEUMATIC_WATER" : "RAMP_CHOKE"),
      levelRl: machine.levelRl,
      reportedBy: reportedBy || "Shift Supervisor",
      desc: reason || `Breakdown logged on ${machine.code}`,
      delayMins: Number(delayMins) || 30,
      etr: etr || "45 mins",
      severity: (severity || "HIGH") as any,
      escalationTier: (escalationTier || "SHIFT_INCHARGE") as any,
      resolved: false
    });
  }


  broadcastFullState();
  res.json({ success: true, message: `Status of ${machine.code} updated to ${targetStatus.toUpperCase()}.`, log: newLog, machine });
});


app.post("/api/breakdowns/resolve", (req: Request, res: Response) => {
  const { logId, machineCode, actionTaken, resolvedBy } = req.body || {};
  let targetLog: MachineBreakdownLog | undefined;


  if (logId) {
    targetLog = breakdownLogs.find(l => l.id === logId);
  } else if (machineCode) {
    targetLog = breakdownLogs.find(l => l.machineCode.toLowerCase() === String(machineCode).toLowerCase() && !l.resolved);
  }


  if (!targetLog) {
    return res.status(404).json({ error: "Breakdown log not found." });
  }


  targetLog.resolved = true;
  targetLog.resolvedAt = new Date().toISOString().replace("T", " ").substring(0, 16);
  targetLog.actionTaken = actionTaken || "Repairs completed and functional test certified.";


  const machine = fleet.find(m => m.code.toLowerCase() === targetLog!.machineCode.toLowerCase());
  if (machine) {
    machine.status = "active";
    machine.statusReason = "Repairs verified & signed off; active in shift cycle";
    machine.lastStatusUpdate = new Date().toISOString().replace("T", " ").substring(0, 16);
    machine.subsystemAlert = undefined;
    machine.idleTimeMins = 0;
  }


  rawBreakdowns.forEach(b => {
    if (b.machineCode.toLowerCase() === targetLog!.machineCode.toLowerCase()) {
      b.resolved = true;
    }
  });


  broadcastFullState();
  res.json({ success: true, message: `Breakdown on ${targetLog.machineCode} resolved. Machine returned to active duty.`, log: targetLog });
});


app.post("/api/tasks/create-upcoming", (req: Request, res: Response) => {
  const { shiftCode, title, category, targetFace, levelRl, assignedMachineCode, requiredRole, assignedTokenNo, targetMeters, targetTonnes, priority, isHazardousTeleremote, notes } = req.body || {};


  if (!title || !targetFace) {
    return res.status(400).json({ error: "Task title and targetFace are required." });
  }


  const shift = (shiftCode || "C") as "A" | "B" | "C";
  const rl = Number(levelRl) || 250;
  const taskId = "TSK-UP-" + (tasks.length + 1).toString().padStart(2, "0");


  let workerName: string | undefined = undefined;
  if (assignedTokenNo) {
    const w = workforce.find(item => item.tokenNo === Number(assignedTokenNo));
    if (w) {
      workerName = w.name;
      w.assignedAssetOrBeat = `${title} (${targetFace})`;
    }
  }


  const face = faces.find(f => f.id.toLowerCase() === String(targetFace).toLowerCase());
  if (face) {
    face.upcomingShiftPlan = {
      shiftCode: shift,
      plannedTask: title,
      plannedMeters: Number(targetMeters) || face.targetMeters,
      plannedTonnes: Number(targetTonnes) || (face.targetTonnes || 300),
      assignedMachine: assignedMachineCode || face.assignedMachine,
      assignedOperator: workerName || "Pending Operator",
      priority: (priority || "HIGH_P2") as TaskPriority
    };
  }


  const newTask: UndergroundTask = {
    id: taskId,
    title,
    category: category || "HEMM_MUCKING",
    shiftCode: shift,
    shiftTiming: shift === "C" ? "Shift C (00:00 - 08:00)" : shift === "A" ? "Shift A (08:00 - 16:00)" : "Shift B (16:00 - 00:00)",
    levelRl: rl,
    targetAssetOrFace: targetFace,
    targetMeters: Number(targetMeters) || 0,
    targetTonnes: Number(targetTonnes) || 0,
    priority: (priority || "HIGH_P2") as TaskPriority,
    requiredRole: requiredRole || "HEMM_OPERATOR",
    isHazardousTeleremote: Boolean(isHazardousTeleremote),
    assignedMachineCode: assignedMachineCode,
    assignedTokenNo: assignedTokenNo ? Number(assignedTokenNo) : undefined,
    assignedWorkerName: workerName,
    status: workerName ? "CONFIRMED" : "PENDING",
    notes: notes || `Planned for upcoming Shift ${shift}`
  };


  tasks.unshift(newTask);


  broadcastFullState();
  res.json({ success: true, message: `Task '${title}' successfully scheduled for upcoming Shift ${shift}.`, task: newTask, facePlan: face?.upcomingShiftPlan });
});


app.post("/api/faces/plan", (req: Request, res: Response) => {
  const { faceId, shiftCode, plannedTask, plannedMeters, plannedTonnes, assignedMachine, assignedOperator, priority } = req.body || {};
  if (!faceId) return res.status(400).json({ error: "faceId is required." });


  let face = faces.find(f => f.id.toLowerCase() === String(faceId).toLowerCase());
  if (!face) {
    return res.status(404).json({ error: `Heading face ${faceId} not found.` });
  }


  face.upcomingShiftPlan = {
    shiftCode: (shiftCode || "C") as "A" | "B" | "C",
    plannedTask: plannedTask || "Face Advance Cycle",
    plannedMeters: Number(plannedMeters) || face.targetMeters,
    plannedTonnes: Number(plannedTonnes) || (face.targetTonnes || 300),
    assignedMachine: assignedMachine || face.assignedMachine,
    assignedOperator: assignedOperator || face.assignedMate,
    priority: (priority || "HIGH_P2") as TaskPriority
  };


  broadcastFullState();
  res.json({ success: true, message: `Upcoming plan for face ${face.id} updated.`, face });
});


app.get("/api/sic/loss-tree", (_req: Request, res: Response) => {
  res.json(computeShiftLossTree());
});


app.post("/api/auth/login", (req: Request, res: Response) => {
  try {
    const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body)) ? req.body : {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const role = String(body.role || "").trim();


    if (!email || !password || !role) {
      return res.status(400).json({ error: "Email, Security PIN, and Clearance Role are required." });
    }


    const match = users.find(u => String(u.email || "").trim().toLowerCase() === email);
    if (!match || String(match.password || "") !== password) {
      return res.status(401).json({ error: "Invalid credentials. Please verify your Email and Security PIN." });
    }


    if (match.role !== role) {
      return res.status(403).json({ error: "RBAC Violation: Clearance role does not match user account profile." });
    }


    return res.status(200).json({ success: true, user: match });
  } catch (err) {
    console.error("Login route error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Authentication service error." });
    }
  }
});


app.post("/api/cr/parse-whatsapp", async (req: Request, res: Response) => {
  const { rawText, userRole } = req.body;
  if (!["admin", "control_room", "shift_incharge"].includes(userRole)) {
    return res.status(403).json({ error: "Unauthorized: Control Room clearance required." });
  }


  const text = String(rawText || "").trim();
  if (!text) return res.status(400).json({ error: "Message text cannot be empty." });


  try {
    const sysPrompt = `You are the underground mining telemetry parser for HZL Zawarmala. 
Extract operational shift parameters from WhatsApp dispatch texts into valid JSON:
{
  "muckedTonnes": number,
  "skipsHoisted": number,
  "drilledMeters": number,
  "crusherStatus": "NORMAL" | "JAMMED",
  "rampStatus": "CLEAR" | "BLOCKED",
  "newTaskRequest": string | null,
  "summary": string
}
CRITICAL SAFETY & MINING HEURISTICS:
1. Expressions like '430 mRL' or '245 mRL' are sublevel elevations (Reduced Level in meters), NEVER drilled meters!
2. Only assign drilledMeters if the text describes drilling, face advance, jumbo, longhole or simba meters drilled.
3. If the message requests a new task, populate 'newTaskRequest'.`;


    const aiResponse = await callGeminiInteractions(text, sysPrompt);
    const cleanJson = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    const extracted = JSON.parse(cleanJson);


    if (extracted.newTaskRequest) {
      const rlMatch = text.match(/(\d{2,3})\s*mrl/i);
      const rl = rlMatch ? parseInt(rlMatch[1], 10) : 430;
      tasks.push({
        id: "TSK-" + (tasks.length + 1).toString().padStart(2, "0"),
        title: extracted.newTaskRequest,
        category: "HEMM_MUCKING",
        levelRl: rl,
        targetAssetOrFace: `${rl} mRL Heading`,
        priority: "HIGH_P2",
        requiredRole: "HEMM_OPERATOR",
        isHazardousTeleremote: false,
        status: "PENDING"
      });
      broadcastFullState();
    }


    return res.json({ success: true, extracted });
  } catch (err: any) {
    console.warn("Gemini parser offline or key unset, using advanced rule-based fallback:", err.message);


    const extracted: any = {
      muckedTonnes: 0,
      skipsHoisted: 0,
      drilledMeters: 0,
      crusherStatus: "NORMAL",
      rampStatus: "CLEAR",
      summary: ""
    };


    const muckMatch = text.match(/(?:muck|mucked|tonnes|t)\s*[:=-]?\s*(\d{2,5})/i);
    if (muckMatch) extracted.muckedTonnes = parseInt(muckMatch[1], 10);


    const skipsMatch = text.match(/(?:skip|skips|hoist|hoisted)\s*[:=-]?\s*(\d{1,4})/i);
    if (skipsMatch) extracted.skipsHoisted = parseInt(skipsMatch[1], 10);


    const drillMatch = text.match(/(?:drill|drilled|advance)\s*[:=-]?\s*(\d{1,4}(?:\.\d+)?)\s*(?:m|mtr|meters)(?!\s*rl)/i);
    if (drillMatch) extracted.drilledMeters = parseFloat(drillMatch[1]);


    if (/crusher jam|rockbolt jam|choke/i.test(text)) extracted.crusherStatus = "JAMMED";
    if (/ramp block|stalled|choke decline/i.test(text)) extracted.rampStatus = "BLOCKED";


    if (/add (?:new )?task/i.test(text)) {
      const rlMatch = text.match(/(\d{2,3})\s*mrl/i);
      const rl = rlMatch ? parseInt(rlMatch[1], 10) : 430;
      tasks.push({
        id: "TSK-" + (tasks.length + 1).toString().padStart(2, "0"),
        title: text.replace(/add new task to /i, "").trim(),
        category: "HEMM_MUCKING",
        levelRl: rl,
        targetAssetOrFace: `${rl} mRL Heading`,
        priority: "HIGH_P2",
        requiredRole: "HEMM_OPERATOR",
        isHazardousTeleremote: false,
        status: "PENDING"
      });
      broadcastFullState();
    }


    extracted.summary = `Detected ${extracted.muckedTonnes} T Mucked, ${extracted.skipsHoisted} Skips, ${extracted.drilledMeters}m Drilled. Crusher: ${extracted.crusherStatus}.`;
    return res.json({ success: true, extracted });
  }
});


app.post("/api/ai/command", async (req: Request, res: Response) => {
  const { prompt, userRole } = req.body;
  if (userRole !== "admin" && userRole !== "shift_incharge") {
    return res.status(403).json({ error: "Administrator or Shift Incharge authorization required." });
  }


  const p = String(prompt || "").trim();
  if (!p) return res.status(400).json({ error: "Empty prompt command." });


  try {
    const sysPrompt = `You are VAJRA-Copilot, an underground mining operations dispatch AI at HZL Zawarmala.
Current Fleet State: ${JSON.stringify(fleet.map(m => ({ code: m.code, slot: m.rampSlot, status: m.status, rl: m.levelRl })))}
Active Breakdowns: ${JSON.stringify(breakdownLogs.filter(b => !b.resolved))}
Analyze the commander's directive and respond with a crisp, actionable execution dispatch order (under 40 words).`;


    const aiMessage = await callGeminiInteractions(p, sysPrompt);


    if (/divert|passing bay|clear decline|anti-bunching/i.test(p)) {
      const gt11 = fleet.find(m => m.code === "GT 11");
      if (gt11) gt11.rampSlot = "PASSING_BAY_228";
      broadcastFullState();
    }


    return res.json({ success: true, message: aiMessage });
  } catch (err: any) {
    if (/divert|reroute|passing bay/i.test(p)) {
      const gt11 = fleet.find(m => m.code === "GT 11");
      if (gt11) gt11.rampSlot = "PASSING_BAY_228";
      broadcastFullState();
      return res.json({ success: true, message: "Decline anti-bunching executed: GT 11 held at Passing Bay PB-228 to yield single-lane ramp right-of-way." });
    }
    return res.json({ success: true, message: "Command processed: Operational directive logged to shift dispatch ledger." });
  }
});


app.post("/api/cr/update-production", (req: Request, res: Response) => {
  const { shiftCode, drilledMeters, muckedTonnes, skipsHoisted, breakdownMins, userRole, reportedBy } = req.body;
  if (!["admin", "control_room", "shift_incharge"].includes(userRole)) {
    return res.status(403).json({ error: "Unauthorized: Control Room reporting access required." });
  }


  const record = shiftProductionRecords.find(s => s.shiftCode === shiftCode);
  if (!record) return res.status(404).json({ error: "Shift record not found." });


  const now = new Date();
  const currentHour = now.getHours();


  let isWindowExpired = false;
  if (shiftCode === "A" && currentHour >= 17 && currentHour < 24) isWindowExpired = true;
  if (shiftCode === "B" && currentHour >= 1 && currentHour < 16) isWindowExpired = true;
  if (shiftCode === "C" && currentHour >= 9 && currentHour < 24) isWindowExpired = true;


  const numericValues = [drilledMeters, muckedTonnes, skipsHoisted, breakdownMins].map(Number);
  if (numericValues.some(v => !Number.isFinite(v) || v < 0)) {
    return res.status(400).json({ error: "Production values must be finite, non-negative numbers." });
  }


  if (isWindowExpired && userRole !== "admin") {
    record.isLocked = true;
    return res.status(423).json({
      error: `SHIFT LOCKED: Shift ${shiftCode} ended over 1 hour ago. Figures are locked under DGMS statutory closure.`
    });
  }


  record.drilledMeters = Number(drilledMeters);
  record.muckedTonnes = Number(muckedTonnes);
  record.skipsHoisted = Number(skipsHoisted);
  record.breakdownMins = Number(breakdownMins);
  record.reportedBy = reportedBy || "Control Room Officer";
  record.lastUpdated = new Date().toISOString().replace("T", " ").substring(0, 16);


  metrics.hoistShiftTonnes = record.muckedTonnes;
  metrics.currentTakt = parseFloat(((record.muckedTonnes / 2100) * 60).toFixed(1));
  kpis.metalTaktPerPerson.current = metrics.currentTakt;


  broadcastFullState();
  res.json({ success: true, message: `Shift ${shiftCode} production updated successfully.`, record });
});


app.get("/api/tasks/list", (_req, res) => {
  res.json({ tasks, conflicts });
});


app.post("/api/tasks/upsert", (req: Request, res: Response) => {
  const { task, userRole } = req.body || {};
  if (!["admin", "shift_incharge", "foreman"].includes(userRole)) {
    return res.status(403).json({ error: "Unauthorized to modify tasks." });
  }
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    return res.status(400).json({ error: "A valid task object is required." });
  }


  const existingIdx = tasks.findIndex(t => t.id === task.id);
  if (existingIdx >= 0) {
    tasks[existingIdx] = { ...tasks[existingIdx], ...task };
  } else {
    tasks.push({
      ...task,
      id: task.id || "TSK-" + (tasks.length + 1).toString().padStart(2, "0"),
      status: task.status || "PENDING"
    });
  }


  broadcastFullState();
  res.json({ success: true, tasks });
});


app.get("/api/allocation/recommend", (_req: Request, res: Response) => {
  res.json(recommendEffectiveAllocation());
});


app.post("/api/allocation/apply-custom", (req: Request, res: Response) => {
  const { taskId, tokenNo, userRole, requestingSection } = req.body;
  const userRoleStr = (userRole || "") as Role;


  const targetTask = tasks.find(t => t.id === taskId);
  if (!targetTask) return res.status(404).json({ error: "Task not found." });


  const worker = workforce.find(w => w.tokenNo === Number(tokenNo));
  if (!worker) return res.status(404).json({ error: "Worker not found in 434 roster." });


  if (!worker.isInsideMine) {
    return res.status(400).json({ error: `Safety Violation: Worker ${worker.name} (${worker.tokenNo}) has NOT clocked inside the mine.` });
  }


  if (targetTask.isHazardousTeleremote && (!worker.teleRemoteEligible || worker.fatigueRiskLevel === "HIGH_RISK" || worker.shiftStatus === "SHORT_PUNCH")) {
    return res.status(400).json({
      error: `Fatigue Lock: ${worker.name} logged short-punch. Disqualified from hazardous teleremote operations under DGMS guidelines.`
    });
  }


  if (userRoleStr === "oem_rep") {
    const oemMatch = users.find(u => u.role === "oem_rep" && u.email === req.body.userEmail);
    if (!oemMatch || !oemMatch.oemCompany) {
      return res.status(403).json({ error: "OEM clearance required." });
    }
    const machine = fleet.find(m => m.code === targetTask.targetAssetOrFace);
    if (machine && machine.oem !== oemMatch.oemCompany) {
      return res.status(403).json({ error: `OEM Conflict: Machine OEM does not match ${oemMatch.oemCompany}.` });
    }
  }


  if (worker.category === "STATUTORY_MATE" && userRoleStr === "foreman") {
    const existingConflictTask = tasks.find(t => t.assignedTokenNo === worker.tokenNo && t.id !== taskId && t.requestedBySection && t.requestedBySection !== requestingSection);


    if (existingConflictTask) {
      const conflictId = "CONF-" + Date.now();
      const conflictObj: StatutoryConflict = {
        id: conflictId,
        mateTokenNo: worker.tokenNo,
        mateName: worker.name,
        requestedBySections: [existingConflictTask.requestedBySection!, requestingSection || "Unknown Section"],
        competingTasks: [existingConflictTask.title, targetTask.title],
        sublevelRls: [existingConflictTask.levelRl, targetTask.levelRl],
        escalatedTo: "MINE_MANAGER",
        status: "OPEN"
      };


      conflicts.push(conflictObj);
      targetTask.status = "DISPUTED";
      existingConflictTask.status = "DISPUTED";


      broadcastFullState();
      return res.status(409).json({
        conflict: true,
        message: `CONFLICT ESCALATED: Mining Mate ${worker.name} requested simultaneously. Locked pending Mine Manager review.`,
        conflictObj
      });
    }
  }


  targetTask.assignedTokenNo = worker.tokenNo;
  targetTask.assignedWorkerName = worker.name;
  targetTask.status = "CONFIRMED";
  targetTask.requestedBySection = requestingSection || targetTask.requestedBySection;
  worker.assignedAssetOrBeat = `${targetTask.title} (${targetTask.levelRl} mRL)`;


  const m = fleet.find(mc => mc.code === targetTask.targetAssetOrFace);
  if (m) {
    m.operator = `${worker.name} (${worker.tokenNo})`;
    m.status = "active";
  }


  broadcastFullState();
  res.json({
    success: true,
    message: `Allocated ${worker.name} [T#${worker.tokenNo}] to ${targetTask.title}.`,
    task: targetTask
  });
});


app.post("/api/sic/dispatch-mip", (req, res) => {
  const { userRole, approvedBy } = req.body;
  if (userRole !== "admin" && userRole !== "shift_incharge") {
    return res.status(403).json({ error: "Only Shift Incharge or Admin can authorize recovery." });
  }


  metrics.recoveryExecuted = true;
  metrics.currentTakt = 58.6;
  metrics.cobBinPercentage = 46.0;
  metrics.monteCarloProbability = 91.5;
  kpis.metalTaktPerPerson.current = 58.6;
  kpis.equipmentUtilizationPct.current = 75.4;
  kpis.equipmentIdleTimeMins.current = 29.0;


  const cl19 = breakdownLogs.find(b => b.machineCode === "CL-19");
  if (cl19) { cl19.resolved = true; cl19.actionTaken = "Towed to passing bay and bypass traffic cleared."; }
  const crusher = rawBreakdowns.find(b => b.machineCode === "PRIMARY_CRUSHER");
  if (crusher) crusher.resolved = true;


  const cl19Machine = fleet.find(m => m.code === "CL-19");
  if (cl19Machine) { cl19Machine.status = "active"; cl19Machine.statusReason = "Steering assembly repaired; returned to service"; }


  fleet.forEach(m => {
    if (m.code === "GT 10" || m.code === "EMT-1") {
      m.levelRl = 265;
      m.status = "active";
      m.rampSlot = "PORTAL_HAUL";
      m.idleTimeMins = 5;
    }
  });


  broadcastFullState();
  emitSse("dispatch_confirmed", { runRate: 58.6, approvedBy });
  res.json({ success: true, message: "MIP Optimal Work Order Dispatched: Haulers rerouted to 265 mRL; Crusher feeder cleared." });
});


app.post("/api/sic/teleremote-handover", (req: Request, res: Response) => {
  const { userRole } = req.body;
  if (!["admin", "shift_incharge"].includes(userRole)) {
    return res.status(403).json({ error: "Only Shift Incharge or Admin can authorize blast-window handover." });
  }


  const teleRigs = fleet.filter(m => m.teleRemoteReady && m.status !== "breakdown");
  teleRigs.forEach(r => {
    r.status = "active";
    r.operator = "Surface Teleremote Chair (Remote Desk 01)";
    r.idleTimeMins = 0;
  });


  kpis.faceUtilizationPct.current = 78.5;
  kpis.lhdProductiveHours.current = 6.1;


  broadcastFullState();
  res.json({
    success: true,
    message: `Autonomous blast-window activated: ${teleRigs.length} machines switched to surface teleremote.`,
    machines: teleRigs.map(m => m.code)
  });
});


app.post("/api/breakdown/escalate", (req: Request, res: Response) => {
  const { breakdownId, targetTier, userRole } = req.body;
  if (!["admin", "shift_incharge", "foreman"].includes(userRole)) {
    return res.status(403).json({ error: "Unauthorized to escalate breakdown." });
  }


  const b = breakdownLogs.find(item => item.id === String(breakdownId));
  if (!b) {
    const raw = rawBreakdowns.find(item => item.id === Number(breakdownId));
    if (raw) {
      raw.escalationTier = targetTier;
      broadcastFullState();
      return res.json({ success: true, message: `Breakdown on ${raw.machineCode} escalated to ${targetTier}.`, breakdown: raw });
    }
    return res.status(404).json({ error: "Breakdown not found." });
  }


  b.escalationTier = targetTier;
  broadcastFullState();
  res.json({ success: true, message: `Breakdown on ${b.machineCode} escalated to ${targetTier}.`, breakdown: b });
});


app.get("/api/reports/dgms-csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="DGMS_Statutory_Shift_Report_Zawarmala.csv"');


  let csv = "DGMS STATUTORY SHIFT LOG & MINING MATE HANDOVER - HZL ZAWARMALA\n";
  csv += "Date: 2026-10-02, Shift: B (16:00 - 00:00), Shift Incharge: Dushyant Tailor, Mine Manager: Nand Lal Swami\n\n";
  csv += "1. STATUTORY MINING MATE BEAT ALLOCATION\n";
  csv += "Token No,Mining Mate Name,Designation,Assigned Sublevel / Beat,Shift Status,Inside Mine,Fatigue Level\n";
  workforce
    .filter(w => w.category === "STATUTORY_MATE")
    .forEach(w => {
      csv += `${w.tokenNo},"${w.name}","${w.designation}","${w.assignedAssetOrBeat || "--"}","${w.shiftStatus}","${w.isInsideMine ? "YES" : "NO"}","${w.fatigueRiskLevel}"\n`;
    });


  csv += "\n2. COMPLETE 40-EQUIPMENT FLEET STATUS & BREAKDOWN LOG\n";
  csv += "Machine Code,Category,Model,OEM,Capacity (T),Status,Level RL,Reason / Fault Details,GC Due Date,Operator\n";
  fleet.forEach(m => {
    csv += `"${m.code}","${m.category}","${m.model}","${m.oem}",${m.nominalCapacity},"${m.status.toUpperCase()}",${m.levelRl},"${m.statusReason || "--"}","${m.gcDueDate || "--"}","${m.operator}"\n`;
  });


  csv += "\n3. UPCOMING SHIFT TASK & TARGETED FACE SCHEDULE\n";
  csv += "Shift,Task ID,Title,Target Face / Location,Category,Level (mRL),Assigned Machine,Operator,Planned Advance (m),Planned Ore (T),Priority\n";
  tasks.filter(t => t.shiftCode === "C").forEach(t => {
    csv += `"${t.shiftCode}","${t.id}","${t.title}","${t.targetAssetOrFace}","${t.category}",${t.levelRl},"${t.assignedMachineCode || "--"}","${t.assignedWorkerName || "--"}",${t.targetMeters || 0},${t.targetTonnes || 0},"${t.priority}"\n`;
  });


  csv += "\n4. SHIFT-WISE PRODUCTION AND HOISTING REGISTER\n";
  csv += "Shift,Hours,Drilled (m),Mucked (T),Skips,Downtime (min),Reported By,Lockout Status\n";
  shiftProductionRecords.forEach(s => {
    csv += `"${s.shiftName}","${s.startTime}-${s.endTime}",${s.drilledMeters},${s.muckedTonnes},${s.skipsHoisted},${s.breakdownMins},"${s.reportedBy}","${s.isLocked ? "LOCKED" : "OPEN"}"\n`;
  });


  res.send(csv);
});


// ========================================================
// 6. CONTROL ROOM UI (HIGH-CONTRAST DUAL-MODE DASHBOARD)
// ========================================================
app.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VAJRA // HZL Zawarmala Short Interval Command Center</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'JetBrains Mono', monospace; transition: background-color 0.25s, color 0.25s; }
    html.dark body { background-color: #07090E; color: #F1F5F9; }
    html:not(.dark) body { background-color: #F8FAFC; color: #0F172A; }
    .glass-card { transition: background-color 0.2s, border-color 0.2s; }
    html.dark .glass-card { background: rgba(15, 23, 42, 0.75); border: 1px solid #1E293B; backdrop-filter: blur(8px); }
    html:not(.dark) .glass-card { background: #FFFFFF; border: 1px solid #E2E8F0; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05); }
    .sub-card { transition: background-color 0.2s, border-color 0.2s; }
    html.dark .sub-card { background: #0B0F19; border: 1px solid #1E293B; }
    html:not(.dark) .sub-card { background: #F1F5F9; border: 1px solid #E2E8F0; }
    .theme-input { transition: all 0.2s; }
    html.dark .theme-input { background-color: #07090E; border-color: #334155; color: #FFFFFF; }
    html:not(.dark) .theme-input { background-color: #FFFFFF; border-color: #CBD5E1; color: #0F172A; }
    .glow-amber { box-shadow: 0 0 25px rgba(245, 158, 11, 0.22); }
    .glow-cyan { box-shadow: 0 0 25px rgba(6, 182, 212, 0.22); }
    .glow-purple { box-shadow: 0 0 25px rgba(168, 85, 247, 0.22); }
  </style>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { amber: '#F59E0B', cyan: '#06B6D4', emerald: '#10B981', darkBg: '#07090E' }
          }
        }
      }
    };


    window.curUser = null;
    window.localStore = {};
    window.fleetCategoryFilter = 'ALL';
    window.fleetStatusFilter = 'ALL';


    function nav(screenName) {
      ['landing', 'login', 'signup', 'app'].forEach(function(s) {
        var el = document.getElementById('screen-' + s);
        if (el) el.classList.toggle('hidden', s !== screenName);
      });
    }
    window.nav = nav;


    window.tab = function(name) {
      var tabs = ['kpis', 'losstree', 'faces', 'sic', 'hourly', 'tasks', 'cr', 'roster', 'gantt', 'traffic', 'oem', 'shiftend', 'copilot', 'breakdownlogs', 'upcomingplan'];
      tabs.forEach(function(t) {
        var pane = document.getElementById('pane-' + t);
        var tabBtn = document.getElementById('tab-' + t);
        if (pane) pane.classList.add('hidden');
        if (tabBtn) tabBtn.className = 'px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap transition font-semibold text-xs';
      });


      var activePane = document.getElementById('pane-' + name);
      var activeTab = document.getElementById('tab-' + name);
      if (activePane) activePane.classList.remove('hidden');
      if (activeTab) activeTab.className = 'px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-black whitespace-nowrap glow-amber text-xs';
      if (name === 'gantt') window.renderTimeline(19.5);
    };


    window.toggleTheme = function() {
      var isDark = document.documentElement.classList.contains('dark');
      var icon = document.getElementById('themeIcon');
      var label = document.getElementById('themeLabel');
      
      if (isDark) {
        document.documentElement.classList.remove('dark');
        if (icon) icon.innerHTML = '&#x1F319;';
        if (label) label.innerText = 'Dark Mode';
        localStorage.setItem('vajra_theme', 'light');
      } else {
        document.documentElement.classList.add('dark');
        if (icon) icon.innerHTML = '&#x2600;';
        if (label) label.innerText = 'Light Mode';
        localStorage.setItem('vajra_theme', 'dark');
      }
    };


    window.fastRole = function(role, email) {
      document.getElementById('loginRole').value = role;
      document.getElementById('loginEmail').value = email;
      document.getElementById('loginPass').value = '123';
    };


    window.enterConsole = function() {
      if (!window.curUser) return;
      window.nav('app');
      window.tab(window.curUser.role === 'control_room' ? 'cr' : 'kpis');


      var nameEl = document.getElementById('uName');
      if (nameEl) nameEl.innerText = window.curUser.name || 'Operator';


      var b = document.getElementById('uRoleBadge');
      if (b) {
        b.innerText = (window.curUser.role || '').replace('_', ' ');
        b.className = window.curUser.role === 'admin' ? 'text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider' :
                      window.curUser.role === 'control_room' ? 'text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider' :
                      window.curUser.role === 'shift_incharge' ? 'text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-wider' :
                      'text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider';
      }


      window.fetchState();
      window.initSse();
    };


    window.doLogin = async function() {
      var btn = document.getElementById('loginButton');
      var original = btn ? btn.textContent : 'Authenticate Clearance';
      try {
        var email = document.getElementById('loginEmail').value.trim();
        var password = document.getElementById('loginPass').value.trim();
        var role = document.getElementById('loginRole').value.trim();
        if (!email || !password || !role) return alert('Enter email, password, and select clearance role.');


        if (btn) { btn.disabled = true; btn.textContent = 'AUTHENTICATING...'; }


        var res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, role: role })
        });
        var data = await res.json().catch(function() { return {}; });
        if (!res.ok) return alert(data.error || 'Login failed.');


        window.curUser = data.user;
        window.enterConsole();
      } catch (err) {
        alert('Authentication error: ' + err.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = original; }
      }
    };


    window.fetchState = async function() {
      try {
        var res = await fetch('/api/state');
        window.localStore = await res.json();
        window.renderUI();
      } catch (err) {
        console.error('Fetch state failed:', err);
      }
    };


    window.initSse = function() {
      if (!window.curUser) return;
      try {
        var es = new EventSource('/api/events?userId=' + window.curUser.id + '&role=' + window.curUser.role);
        es.addEventListener('presence', function(e) {
          var d = JSON.parse(e.data);
          var uc = document.getElementById('userCount');
          if (uc) uc.innerText = d.count;
        });
        es.addEventListener('state_update', function(e) {
          Object.assign(window.localStore, JSON.parse(e.data));
          window.renderUI();
        });
      } catch (e) {
        console.warn('SSE failed:', e);
      }
    };


    window.filterFleetCategory = function(cat) {
      window.fleetCategoryFilter = cat;
      ['ALL', 'LPDT', 'LHD', 'DRILL', 'UTILITY', 'ADDITIONAL'].forEach(function(c) {
        var btn = document.getElementById('cat-btn-' + c);
        if (btn) {
          btn.className = (c === cat) ? 'px-3 py-1 rounded-lg text-xs font-black bg-amber-500 text-slate-950' : 'px-3 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300 hover:border-amber-500';
        }
      });
      window.renderFleetTable();
    };


    window.filterFleetStatus = function(stat) {
      window.fleetStatusFilter = stat;
      ['ALL', 'active', 'idle', 'breakdown', 'gc_due', 'maintenance'].forEach(function(s) {
        var btn = document.getElementById('stat-btn-' + s);
        if (btn) {
          btn.className = (s === stat) ? 'px-2.5 py-1 rounded-lg text-xs font-black bg-cyan-600 text-white' : 'px-2.5 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300 hover:border-cyan-500';
        }
      });
      window.renderFleetTable();
    };


    window.populateMachineDropdowns = function() {
      var fleet = window.localStore.fleet || [];
      var logSel = document.getElementById('logMachineSel');
      var upMachSel = document.getElementById('upMachineSel');


      if (logSel) {
        var cur = logSel.value;
        logSel.innerHTML = '<option value="">-- Select Machine (All 40 HEMM) --</option>' + fleet.map(function(m) {
          var statBadge = m.status === 'breakdown' ? '🔴 BREAKDOWN' : m.status === 'gc_due' ? '🟣 GC DUE' : m.status === 'idle' ? '🟡 IDLE' : m.status === 'maintenance' ? '🔵 MAINT' : '🟢 OK';
          return '<option value="' + m.code + '">' + m.code + ' [' + m.category + ' &bull; ' + m.oem + ' ' + m.model + '] (' + statBadge + ')</option>';
        }).join('');
        if (cur) logSel.value = cur;
      }


      if (upMachSel) {
        var cur2 = upMachSel.value;
        upMachSel.innerHTML = '<option value="">-- Deploy Machine (All 40 HEMM) --</option>' + fleet.map(function(m) {
          var statBadge = m.status === 'breakdown' ? '🔴 BREAKDOWN' : m.status === 'gc_due' ? '🟣 GC DUE' : m.status === 'idle' ? '🟡 IDLE' : '🟢 OK';
          return '<option value="' + m.code + '">' + m.code + ' (' + m.category + ' - ' + (m.nominalCapacity ? m.nominalCapacity + 'T' : m.model) + ') [' + statBadge + ']</option>';
        }).join('');
        if (cur2) upMachSel.value = cur2;
      }
    };


    window.populateFaceDropdowns = function() {
      var faces = window.localStore.faces || [];
      var upFaceSel = document.getElementById('upFaceSel');
      if (upFaceSel) {
        var cur = upFaceSel.value;
        upFaceSel.innerHTML = '<option value="">-- Select Heading Face --</option>' + faces.map(function(f) {
          return '<option value="' + f.id + '">' + f.id + ' (' + f.levelRl + ' mRL &bull; ' + f.cycleState + ')</option>';
        }).join('') + '<option value="NEW_CUSTOM">+ Add Custom Face / Beat</option>';
        if (cur) upFaceSel.value = cur;
      }
    };


    window.handleFaceSelectChange = function(val) {
      if (val === 'NEW_CUSTOM') {
        var newFace = prompt('Enter new heading face identifier (e.g. 300-NORTH-01):');
        if (newFace) {
          var rl = prompt('Enter Sublevel RL (meters, e.g. 300):', '250');
          var upFaceSel = document.getElementById('upFaceSel');
          var opt = document.createElement('option');
          opt.value = newFace;
          opt.text = newFace + ' (' + rl + ' mRL)';
          opt.selected = true;
          upFaceSel.add(opt, upFaceSel.options[upFaceSel.options.length - 1]);
          document.getElementById('upLevelRl').value = rl;
        }
      } else {
        var face = (window.localStore.faces || []).find(function(f) { return f.id === val; });
        if (face) {
          document.getElementById('upLevelRl').value = face.levelRl;
          if (face.targetMeters) document.getElementById('upTargetMeters').value = face.targetMeters;
          if (face.targetTonnes) document.getElementById('upTargetTonnes').value = face.targetTonnes;
        }
      }
    };


    window.renderFleetTable = function() {
      var tbody = document.getElementById('fleetTableBody');
      if (!tbody || !Array.isArray(window.localStore.fleet)) return;


      var filtered = window.localStore.fleet.filter(function(m) {
        var catMatch = (window.fleetCategoryFilter === 'ALL' || m.category === window.fleetCategoryFilter);
        var statMatch = (window.fleetStatusFilter === 'ALL' || m.status === window.fleetStatusFilter || (window.fleetStatusFilter === 'active' && m.status === 'ok'));
        return catMatch && statMatch;
      });


      tbody.innerHTML = filtered.map(function(m) {
        var badge = m.status === 'breakdown' ? '<span class="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 font-extrabold text-[10px]">🔴 BREAKDOWN</span>' :
                    m.status === 'gc_due' ? '<span class="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-700 font-extrabold text-[10px]">🟣 GC DUE</span>' :
                    m.status === 'idle' ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 font-extrabold text-[10px]">🟡 IDLE</span>' :
                    m.status === 'maintenance' ? '<span class="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 font-extrabold text-[10px]">🔵 MAINT</span>' :
                    '<span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 font-extrabold text-[10px]">🟢 OK / ACTIVE</span>';


        return '<tr>' +
          '<td class="py-2.5 font-black text-slate-900 dark:text-white">' + m.code + '</td>' +
          '<td class="font-bold text-cyan-600 dark:text-cyan-400 text-[11px]">' + m.category + '</td>' +
          '<td class="text-slate-600 dark:text-slate-300">' + m.oem + ' ' + m.model + '</td>' +
          '<td class="font-semibold">' + (m.nominalCapacity ? m.nominalCapacity + ' Ton' : '--') + '</td>' +
          '<td>' + m.levelRl + ' mRL</td>' +
          '<td>' + badge + '</td>' +
          '<td class="max-w-xs truncate text-[11px] text-slate-600 dark:text-slate-400 font-medium" title="' + (m.statusReason || '') + '">' + (m.statusReason || '--') + '</td>' +
          '<td class="text-slate-500 font-mono text-[10px]">' + (m.gcDueDate || '--') + '</td>' +
          '<td class="text-[11px] text-slate-700 dark:text-slate-300">' + m.operator + '</td>' +
          '<td class="text-right">' +
            '<button data-code="' + m.code + '" data-status="' + m.status + '" onclick="window.quickSelectMachineForLog(this.dataset.code, this.dataset.status)" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-2.5 py-1 rounded text-[10px] uppercase transition">Update</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    };


    window.quickSelectMachineForLog = function(code, curStat) {
      var sel = document.getElementById('logMachineSel');
      if (sel) sel.value = code;
      var statSel = document.getElementById('logStatusSel');
      if (statSel) statSel.value = curStat === 'ok' ? 'active' : curStat;
      window.tab('breakdownlogs');
      var form = document.getElementById('logBreakdownForm');
      if (form) form.scrollIntoView({ behavior: 'smooth' });
    };


    window.renderBreakdownLogsTable = function() {
      var tbody = document.getElementById('breakdownLogsTableBody');
      if (!tbody || !Array.isArray(window.localStore.breakdownLogs)) return;


      tbody.innerHTML = window.localStore.breakdownLogs.map(function(l) {
        var statBadge = l.status === 'breakdown' ? '<span class="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 font-black text-[10px]">BREAKDOWN</span>' :
                        l.status === 'gc_due' ? '<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400 font-black text-[10px]">GC DUE</span>' :
                        l.status === 'idle' ? '<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 font-black text-[10px]">IDLE</span>' :
                        '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 font-bold text-[10px]">OK / ACTIVE</span>';


        var sevBadge = l.severity === 'CRITICAL' ? 'text-red-600 font-black' : l.severity === 'HIGH' ? 'text-amber-600 font-bold' : 'text-slate-500 font-medium';


        var actionBtn = l.resolved ? '<span class="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">&#x2714; RESOLVED</span>' :
          '<button data-id="' + l.id + '" onclick="window.resolveBreakdownLog(this.dataset.id)" class="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-2.5 py-1 rounded text-[10px] uppercase transition">Resolve</button>';


        return '<tr>' +
          '<td class="py-2.5 font-bold font-mono text-[10px] text-slate-500">' + l.id + '</td>' +
          '<td class="font-black text-slate-900 dark:text-white">' + l.machineCode + ' <span class="text-[10px] font-normal text-slate-500">(' + l.machineCategory + ')</span></td>' +
          '<td>' + statBadge + '</td>' +
          '<td class="max-w-md font-medium text-slate-800 dark:text-slate-200">' + l.reason + '</td>' +
          '<td class="font-bold text-slate-900 dark:text-white">' + l.delayMins + ' min</td>' +
          '<td class="text-slate-500">' + l.etr + '</td>' +
          '<td class="' + sevBadge + '">' + l.severity + '</td>' +
          '<td class="font-semibold text-cyan-600 dark:text-cyan-400 text-[10px]">' + l.escalationTier + '</td>' +
          '<td class="text-slate-500 text-[10px]">' + l.reportedBy + ' (' + l.reportedAt.substring(11) + ')</td>' +
          '<td class="text-right">' + actionBtn + '</td>' +
        '</tr>';
      }).join('');
    };


    window.submitBreakdownLog = async function() {
      var machineCode = document.getElementById('logMachineSel').value;
      var status = document.getElementById('logStatusSel').value;
      var reason = document.getElementById('logReasonInput').value.trim();
      var reasonCategory = document.getElementById('logCategorySel').value;
      var levelRl = document.getElementById('logLevelRl').value;
      var delayMins = document.getElementById('logDelayMins').value;
      var etr = document.getElementById('logEtr').value;
      var severity = document.getElementById('logSeveritySel').value;
      var reportedBy = (window.curUser ? window.curUser.name : 'Shift Incharge');


      if (!machineCode || !status) return alert('Please select a machine and target status.');


      try {
        var res = await fetch('/api/breakdowns/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            machineCode: machineCode, status: status, reason: reason, reasonCategory: reasonCategory,
            levelRl: levelRl, delayMins: delayMins, etr: etr, severity: severity, reportedBy: reportedBy
          })
        });
        var data = await res.json();
        if (!res.ok) return alert(data.error || 'Failed to update machine breakdown/status log.');
        alert(data.message);
        document.getElementById('logReasonInput').value = '';
        window.fetchState();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };


    window.resolveBreakdownLog = async function(logId) {
      var actionTaken = prompt('Enter corrective action taken / repair details:');
      if (!actionTaken) return;


      try {
        var res = await fetch('/api/breakdowns/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logId: logId, actionTaken: actionTaken, resolvedBy: (window.curUser ? window.curUser.name : 'Shift Incharge') })
        });
        var data = await res.json();
        if (!res.ok) return alert(data.error || 'Resolution failed.');
        alert(data.message);
        window.fetchState();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };


    window.submitUpcomingTask = async function() {
      var shiftCode = document.getElementById('upShiftCode').value;
      var targetFace = document.getElementById('upFaceSel').value;
      var levelRl = document.getElementById('upLevelRl').value;
      var title = document.getElementById('upTaskTitle').value.trim();
      var category = document.getElementById('upTaskCategory').value;
      var assignedMachineCode = document.getElementById('upMachineSel').value;
      var requiredRole = document.getElementById('upRequiredRole').value;
      var assignedTokenNo = document.getElementById('upWorkerSel').value;
      var targetMeters = document.getElementById('upTargetMeters').value;
      var targetTonnes = document.getElementById('upTargetTonnes').value;
      var priority = document.getElementById('upPriority').value;
      var isHazardousTeleremote = document.getElementById('upIsTeleremote').checked;
      var notes = document.getElementById('upNotes').value.trim();


      if (!title || !targetFace) return alert('Please enter task title and select targeted face.');


      try {
        var res = await fetch('/api/tasks/create-upcoming', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shiftCode: shiftCode, title: title, category: category, targetFace: targetFace,
            levelRl: levelRl, assignedMachineCode: assignedMachineCode, requiredRole: requiredRole,
            assignedTokenNo: assignedTokenNo, targetMeters: targetMeters, targetTonnes: targetTonnes,
            priority: priority, isHazardousTeleremote: isHazardousTeleremote, notes: notes
          })
        });
        var data = await res.json();
        if (!res.ok) return alert(data.error || 'Failed to schedule upcoming task.');
        alert(data.message);
        document.getElementById('upTaskTitle').value = '';
        document.getElementById('upNotes').value = '';
        window.fetchState();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };


    window.renderUpcomingShiftPlanner = function() {
      var container = document.getElementById('targetedFacesCards');
      if (container && Array.isArray(window.localStore.faces)) {
        container.innerHTML = window.localStore.faces.map(function(f) {
          var plan = f.upcomingShiftPlan;
          var planHtml = plan ? (
            '<div class="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800">' +
              '<div class="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">Upcoming Shift ' + plan.shiftCode + ' Plan:</div>' +
              '<div class="font-extrabold text-slate-900 dark:text-white text-xs mt-0.5">' + plan.plannedTask + '</div>' +
              '<div class="flex justify-between items-center text-[10px] text-slate-500 mt-1">' +
                '<span>Rig: <strong class="text-cyan-600 dark:text-cyan-400">' + plan.assignedMachine + '</strong></span>' +
                '<span>Target: <strong class="text-emerald-600 dark:text-emerald-400">' + plan.plannedMeters + 'm / ' + plan.plannedTonnes + 'T</strong></span>' +
              '</div>' +
            '</div>'
          ) : '<div class="mt-2 text-[10px] text-slate-400 italic">No upcoming shift plan locked yet</div>';


          var gasBadge = f.gasClearanceOk ? '<span class="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">&#x2714; Gas Clearance OK</span>' : '<span class="text-red-600 font-bold text-[10px] animate-pulse">&#x26A0; Venting Fumes</span>';


          return '<div class="sub-card p-4 rounded-xl border flex flex-col justify-between">' +
            '<div>' +
              '<div class="flex justify-between items-start">' +
                '<h4 class="font-black text-slate-900 dark:text-white text-sm">' + f.id + ' <span class="text-xs font-normal text-slate-500">(' + f.levelRl + ' mRL)</span></h4>' +
                '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800">' + f.cycleState + '</span>' +
              '</div>' +
              '<div class="text-[11px] text-slate-500 mt-1 flex justify-between">' +
                '<span>Current Rig: ' + f.assignedMachine + '</span>' +
                gasBadge +
              '</div>' +
            '</div>' +
            planHtml +
          '</div>';
        }).join('');
      }


      // Populate worker select in upcoming task form
      var upWorkerSel = document.getElementById('upWorkerSel');
      if (upWorkerSel && Array.isArray(window.localStore.workforce)) {
        var curW = upWorkerSel.value;
        upWorkerSel.innerHTML = '<option value="">-- Assign Operator / Supervisor --</option>' + window.localStore.workforce.map(function(w) {
          var gate = w.isInsideMine ? '🟢 Inside Mine' : '⚪ Surface';
          var fat = w.fatigueRiskLevel === 'HIGH_RISK' ? ' [FATIGUE LOCK]' : '';
          return '<option value="' + w.tokenNo + '">' + w.name + ' (T#' + w.tokenNo + ' - ' + w.category + ' &bull; ' + gate + fat + ')</option>';
        }).join('');
        if (curW) upWorkerSel.value = curW;
      }


      // Render upcoming tasks table
      var upTableBody = document.getElementById('upcomingTasksTableBody');
      if (upTableBody && Array.isArray(window.localStore.tasks)) {
        var upcomingTasks = window.localStore.tasks.filter(function(t) { return t.shiftCode === 'C' || t.id.startsWith('TSK-UP-'); });
        upTableBody.innerHTML = upcomingTasks.map(function(t) {
          var pBadge = t.priority === 'CRITICAL_P1' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 border border-red-300 dark:border-red-700' :
                       t.priority === 'HIGH_P2' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-700' :
                       'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-700';


          return '<tr>' +
            '<td class="py-2.5 font-bold"><span class="px-2 py-0.5 rounded-full text-[10px] font-black ' + pBadge + '">' + t.priority + '</span></td>' +
            '<td class="font-black text-slate-900 dark:text-white">' + t.title + (t.isHazardousTeleremote ? ' <span class="text-[9px] text-amber-600 border border-amber-500 px-1 rounded ml-1 font-bold">TELEREMOTE</span>' : '') + '</td>' +
            '<td class="font-extrabold text-amber-600 dark:text-amber-400">' + t.targetAssetOrFace + ' (' + t.levelRl + ' mRL)</td>' +
            '<td class="text-cyan-600 dark:text-cyan-400 font-bold">' + (t.assignedMachineCode || '--') + '</td>' +
            '<td class="text-slate-800 dark:text-slate-200">' + (t.assignedWorkerName || 'Pending Allocation') + '</td>' +
            '<td class="font-semibold">' + (t.targetMeters ? t.targetMeters + 'm Advance' : '') + (t.targetTonnes ? (t.targetMeters ? ' &bull; ' : '') + t.targetTonnes + ' Tonnes' : '') + '</td>' +
            '<td><span class="px-2 py-0.5 rounded text-[10px] sub-card">' + (t.status || 'PENDING') + '</span></td>' +
          '</tr>';
        }).join('');
      }
    };


    window.renderUI = function() {
      if (!window.localStore) return;


      // 1. Primary Takt Run-Rate
      if (window.localStore.metrics) {
        var m = window.localStore.metrics;
        var rVal = document.getElementById('rateVal');
        if (rVal) rVal.innerText = (m.currentTakt || 0).toFixed(1);
        var rBar = document.getElementById('rateBar');
        if (rBar) rBar.style.width = Math.min(100, ((m.currentTakt / 60) * 100)) + '%';
        var cVal = document.getElementById('cobVal');
        if (cVal) cVal.innerText = (m.cobBinPercentage || 0).toFixed(1) + '%';
        var mcVal = document.getElementById('mcVal');
        if (mcVal) mcVal.innerText = (m.monteCarloProbability || 0).toFixed(1) + '%';
        var advVal = document.getElementById('advVal');
        if (advVal) advVal.innerText = (m.developmentCompliancePct || 0).toFixed(1) + '%';
      }


      // 2. Secondary KPIs Matrix
      var kpiGrid = document.getElementById('secondaryKpiGrid');
      if (kpiGrid && window.localStore.kpis) {
        var k = window.localStore.kpis;
        var cards = [
          { title: "Physical Availability", val: k.physicalAvailabilityPct.current + "%", target: k.physicalAvailabilityPct.target + "%", delta: k.physicalAvailabilityPct.delta },
          { title: "Equipment Utilization", val: k.equipmentUtilizationPct.current + "%", target: k.equipmentUtilizationPct.target + "%", delta: k.equipmentUtilizationPct.delta },
          { title: "Face Utilization", val: k.faceUtilizationPct.current + "%", target: k.faceUtilizationPct.target + "%", delta: k.faceUtilizationPct.delta },
          { title: "LHD Productive Hours", val: k.lhdProductiveHours.current + " hrs", target: k.lhdProductiveHours.target + " hrs", delta: k.lhdProductiveHours.delta },
          { title: "Truck Productive Hours", val: k.truckProductiveHours.current + " hrs", target: k.truckProductiveHours.target + " hrs", delta: k.truckProductiveHours.delta },
          { title: "Dev Advance Compliance", val: k.advanceCompliancePct.current + "%", target: k.advanceCompliancePct.target + "%", delta: k.advanceCompliancePct.delta },
          { title: "Breakdown Response", val: k.breakdownResponseMins.current + " min", target: k.breakdownResponseMins.target + " min", delta: k.breakdownResponseMins.delta },
          { title: "Equipment Idle Time", val: k.equipmentIdleTimeMins.current + " min", target: k.equipmentIdleTimeMins.target + " min", delta: k.equipmentIdleTimeMins.delta }
        ];


        kpiGrid.innerHTML = cards.map(function(c) {
          return '<div class="sub-card p-4 rounded-xl">' +
            '<div class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">' + c.title + '</div>' +
            '<div class="text-xl font-black text-slate-900 dark:text-white mt-1">' + c.val + '</div>' +
            '<div class="flex justify-between items-center mt-2 text-[10px] font-semibold">' +
              '<span class="text-slate-500 dark:text-slate-400">Target: ' + c.target + '</span>' +
              '<span class="text-emerald-600 dark:text-emerald-400 font-bold">' + c.delta + '</span>' +
            '</div>' +
          '</div>';
        }).join('');
      }


      // 3. Loss Tree Visualizer
      if (window.localStore.lossTree) {
        var lt = window.localStore.lossTree;
        var ltTot = document.getElementById('ltTotal'); if (ltTot) ltTot.innerText = lt.totalLostTonnes + ' T';
        var ltBd = document.getElementById('ltBreakdown'); if (ltBd) ltBd.innerText = lt.breakdownLostTonnes + ' T';
        var ltRp = document.getElementById('ltRamp'); if (ltRp) ltRp.innerText = lt.rampTrafficLostTonnes + ' T';
        var ltCr = document.getElementById('ltCrusher'); if (ltCr) ltCr.innerText = lt.crusherJamLostTonnes + ' T';
        var ltWf = document.getElementById('ltWorkforce'); if (ltWf) ltWf.innerText = lt.workforceFatigueLostTonnes + ' T';
        var ltFc = document.getElementById('ltFaces'); if (ltFc) ltFc.innerText = lt.unassignedFaceLostTonnes + ' T';
      }


      // 4. Fleet & Breakdown Log Summaries
      if (Array.isArray(window.localStore.fleet)) {
        var fList = window.localStore.fleet;
        var cTotal = document.getElementById('cntFleetTotal'); if (cTotal) cTotal.innerText = fList.length;
        var cOk = document.getElementById('cntFleetOk'); if (cOk) cOk.innerText = fList.filter(function(m) { return m.status === 'ok' || m.status === 'active'; }).length;
        var cIdle = document.getElementById('cntFleetIdle'); if (cIdle) cIdle.innerText = fList.filter(function(m) { return m.status === 'idle'; }).length;
        var cBd = document.getElementById('cntFleetBreakdown'); if (cBd) cBd.innerText = fList.filter(function(m) { return m.status === 'breakdown'; }).length;
        var cGc = document.getElementById('cntFleetGcDue'); if (cGc) cGc.innerText = fList.filter(function(m) { return m.status === 'gc_due'; }).length;
        var cMaint = document.getElementById('cntFleetMaintenance'); if (cMaint) cMaint.innerText = fList.filter(function(m) { return m.status === 'maintenance'; }).length;
      }


      // 5. Render tables
      window.populateMachineDropdowns();
      window.populateFaceDropdowns();
      window.renderFleetTable();
      window.renderBreakdownLogsTable();
      window.renderUpcomingShiftPlanner();


      // Face Readiness Table (Tab 2)
      var faceBody = document.getElementById('faceTableBody');
      if (faceBody && Array.isArray(window.localStore.faces)) {
        faceBody.innerHTML = window.localStore.faces.map(function(f) {
          var isCold = f.gasClearanceOk && f.coldFaceIdleMins > 30;
          var statusBadge = isCold 
            ? '<span class="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 font-black animate-pulse">COLD FACE ALERT (' + f.coldFaceIdleMins + ' min)</span>'
            : '<span class="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 font-bold">ACTIVE CYCLE</span>';


          return '<tr>' +
            '<td class="py-2.5 font-bold text-slate-900 dark:text-white">' + f.id + ' (' + f.levelRl + ' mRL)</td>' +
            '<td class="font-semibold text-cyan-600 dark:text-cyan-400">' + f.cycleState + '</td>' +
            '<td>' + f.assignedMachine + '</td>' +
            '<td>' + f.assignedMate + '</td>' +
            '<td>' + f.actualMeters + ' / ' + f.targetMeters + ' m</td>' +
            '<td class="text-right">' + statusBadge + '</td>' +
          '</tr>';
        }).join('');
      }


      // Hourly Plan Table (Tab 4)
      var hourlyBody = document.getElementById('hourlyPlanBody');
      if (hourlyBody && Array.isArray(window.localStore.hourlyPlanVsActual)) {
        hourlyBody.innerHTML = window.localStore.hourlyPlanVsActual.map(function(h) {
          var varCol = h.varianceTonnes >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
          var varSign = h.varianceTonnes > 0 ? '+' : '';
          var bottleneckBadge = h.bottleneckDetected 
            ? '<span class="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-bold text-[10px] border border-red-300 dark:border-red-800">' + h.bottleneckDetected + '</span>'
            : '<span class="text-slate-400 font-medium">None &bull; On schedule</span>';


          return '<tr>' +
            '<td class="py-2.5 font-bold text-slate-900 dark:text-white">Hour ' + h.hourNumber + ' <span class="text-[10px] font-normal text-slate-500">(' + h.label + ')</span></td>' +
            '<td class="font-semibold">' + h.planTonnes + ' T</td>' +
            '<td class="font-bold text-cyan-600 dark:text-cyan-400">' + h.actualTonnes + ' T</td>' +
            '<td class="font-extrabold ' + varCol + '">' + varSign + h.varianceTonnes + ' T</td>' +
            '<td>' + bottleneckBadge + '</td>' +
            '<td class="text-slate-600 dark:text-slate-300 font-medium">' + (h.recoveryAction || '--') + '</td>' +
          '</tr>';
        }).join('');
      }


      // Tasks Matrix (Tab 5)
      var taskBody = document.getElementById('taskTableBody');
      if (taskBody && Array.isArray(window.localStore.tasks)) {
        var eligible = (window.localStore.workforce || []).filter(function(w) { return w.isInsideMine && w.shiftStatus === 'PRESENT'; });
        taskBody.innerHTML = window.localStore.tasks.map(function(t) {
          var pColor = t.priority === 'CRITICAL_P1' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 border border-red-300 dark:border-red-700' :
                       t.priority === 'HIGH_P2' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-700' :
                       'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-700';


          var optHtml = eligible
            .filter(function(w) {
              if (w.category !== t.requiredRole) return false;
              if (t.isHazardousTeleremote && (!w.teleRemoteEligible || w.fatigueRiskLevel === 'HIGH_RISK')) return false;
              return true;
            })
            .map(function(w) {
              var selected = t.assignedTokenNo === w.tokenNo ? 'selected' : '';
              return '<option value="' + w.tokenNo + '" ' + selected + '>' + w.name + ' (T#' + w.tokenNo + ' - ' + (w.sublevelRl || 250) + 'mRL)</option>';
            }).join('');


          return '<tr>' +
            '<td class="py-3 font-bold"><span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ' + pColor + '">' + t.priority + '</span></td>' +
            '<td class="text-slate-900 dark:text-white font-bold">' + t.title + (t.isHazardousTeleremote ? ' <span class="text-[9px] text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1 rounded ml-1 font-bold">TELEREMOTE</span>' : '') + '</td>' +
            '<td class="text-slate-600 dark:text-slate-300">' + t.levelRl + ' mRL</td>' +
            '<td class="text-amber-600 dark:text-amber-400 font-extrabold">' + t.targetAssetOrFace + '</td>' +
            '<td><span class="px-2 py-0.5 rounded-md text-[10px] sub-card">' + t.requiredRole + '</span></td>' +
            '<td><select id="sel-' + t.id + '" class="theme-input border rounded-lg p-1.5 text-[11px] w-52 outline-none focus:border-amber-500"><option value="">-- Unassigned --</option>' + optHtml + '</select></td>' +
            '<td class="text-right"><button data-task-id="' + t.id + '" onclick="window.saveSingleAllocation(this.dataset.taskId)" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3 py-1.5 rounded-lg text-[10px] uppercase transition">Commit</button></td>' +
          '</tr>';
        }).join('');
      }


      // Breakdown Escalation SLA (Tab 1)
      var bList = document.getElementById('escalationBreakdowns');
      if (bList && Array.isArray(window.localStore.breakdownLogs)) {
        var unres = window.localStore.breakdownLogs.filter(function(b) { return !b.resolved && (b.status === 'breakdown' || b.status === 'gc_due'); });
        bList.innerHTML = unres.map(function(b) {
          return '<div class="sub-card p-4 rounded-xl flex flex-wrap justify-between items-center gap-3">' +
            '<div>' +
              '<div class="font-black text-slate-900 dark:text-white text-xs">' + b.machineCode + ' &bull; ' + b.reason + '</div>' +
              '<div class="text-[10px] text-slate-500 mt-0.5">Downtime: ' + b.delayMins + ' min &bull; Level: ' + b.levelRl + ' mRL &bull; Current Tier: <span class="font-bold text-amber-600 dark:text-amber-400">' + b.escalationTier + '</span></div>' +
            '</div>' +
            '<div class="flex gap-2">' +
              '<button data-id="' + b.id + '" data-tier="SHIFT_INCHARGE" onclick="window.escalateBreakdown(this.dataset.id, this.dataset.tier)" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded text-[10px] font-bold">Escalate to SIC</button>' +
              '<button data-id="' + b.id + '" data-tier="MINE_MANAGER" onclick="window.escalateBreakdown(this.dataset.id, this.dataset.tier)" class="bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 rounded text-[10px] font-black">Escalate to Manager</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }


      // Roster Table (Tab 7)
      var rosterBody = document.getElementById('rosterBody');
      if (rosterBody && Array.isArray(window.localStore.workforce)) {
        rosterBody.innerHTML = window.localStore.workforce.map(function(w) {
          var gate = w.isInsideMine ? '<span class="text-emerald-600 font-bold">&#x2714; INSIDE MINE</span>' : '<span class="text-slate-400">SURFACE</span>';
          var fatCol = w.fatigueRiskLevel === 'HIGH_RISK' ? 'text-red-600 font-black' : 'text-slate-500';
          return '<tr>' +
            '<td class="py-2.5 font-bold font-mono">' + w.tokenNo + '</td>' +
            '<td class="font-bold text-slate-900 dark:text-white">' + w.name + '</td>' +
            '<td><span class="px-2 py-0.5 rounded text-[10px] sub-card">' + w.category + '</span></td>' +
            '<td>' + gate + '</td>' +
            '<td class="' + fatCol + '">' + w.fatigueRiskLevel + (w.shortPunchHoursLost ? ' (' + w.shortPunchHoursLost + 'h lost)' : '') + '</td>' +
            '<td class="font-bold text-cyan-600 dark:text-cyan-400">' + (w.productivity.tonnesMuckedShift ? w.productivity.tonnesMuckedShift + ' T' : w.productivity.drilledMetersShift ? w.productivity.drilledMetersShift + ' m' : '--') + '</td>' +
            '<td class="text-slate-600 dark:text-slate-300 text-[11px]">' + (w.assignedAssetOrBeat || '--') + '</td>' +
            '<td class="text-right font-bold text-[10px]">' + w.shiftStatus + '</td>' +
          '</tr>';
        }).join('');
      }


      // Shift Production Table (Tab 6)
      var shiftTableBody = document.getElementById('shiftRecordsTableBody');
      if (shiftTableBody && Array.isArray(window.localStore.shiftProductionRecords)) {
        shiftTableBody.innerHTML = window.localStore.shiftProductionRecords.map(function(s) {
          var lBadge = s.isLocked ? '<span class="text-red-600 font-black">&#x1F512; LOCKED</span>' : '<span class="text-emerald-600 font-bold">&#x1F7E2; OPEN</span>';
          return '<tr>' +
            '<td class="py-2 font-bold text-slate-900 dark:text-white">' + s.shiftName + '</td>' +
            '<td>' + s.startTime + ' - ' + s.endTime + '</td>' +
            '<td class="font-mono text-slate-500">' + s.lockoutTime + '</td>' +
            '<td class="font-bold text-cyan-600 dark:text-cyan-400">' + s.muckedTonnes + ' T</td>' +
            '<td class="font-semibold">' + s.drilledMeters + ' m</td>' +
            '<td class="text-slate-500">' + s.reportedBy + '</td>' +
            '<td class="text-right">' + lBadge + '</td>' +
          '</tr>';
        }).join('');
      }


      // OEM Telemetry (Tab 10)
      var oemGrid = document.getElementById('oemGrid');
      if (oemGrid && Array.isArray(window.localStore.oemReliability)) {
        oemGrid.innerHTML = window.localStore.oemReliability.map(function(o) {
          return '<div class="sub-card p-4 rounded-xl">' +
            '<div class="text-sm font-black text-slate-900 dark:text-white">' + o.oem + '</div>' +
            '<div class="mt-2 space-y-1 text-[11px]">' +
              '<div class="flex justify-between text-slate-500"><span>MTBF:</span> <strong class="text-slate-900 dark:text-white">' + o.mtbfHours + ' hrs</strong></div>' +
              '<div class="flex justify-between text-slate-500"><span>MTTR:</span> <strong class="text-slate-900 dark:text-white">' + o.mttrMins + ' min</strong></div>' +
              '<div class="flex justify-between text-slate-500"><span>Availability:</span> <strong class="text-emerald-600 font-extrabold">' + o.availabilityPct + '%</strong></div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    };


    window.renderTimeline = function(currentTime) {
      var container = document.getElementById('timelineEventsContainer');
      if (!container || !window.localStore.timelineEvents) return;
      var events = window.localStore.timelineEvents.filter(function(e) { return e.time <= currentTime; });
      container.innerHTML = events.map(function(e) {
        var pill = e.type === 'CRITICAL' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 border border-red-300 dark:border-red-800' :
                   e.type === 'TRAFFIC' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-800' :
                   e.type === 'DISPATCH' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800' :
                   'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800';


        return '<div class="sub-card p-3.5 rounded-xl flex justify-between items-center">' +
          '<div>' +
            '<span class="text-amber-600 dark:text-amber-400 font-bold">' + e.timeStr + '</span> &bull; ' +
            '<span class="text-slate-900 dark:text-white font-semibold">' + e.title + '</span>' +
            '<p class="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">' + e.desc + '</p>' +
          '</div>' +
          '<span class="px-2 py-0.5 rounded text-[10px] font-bold ' + pill + '">' + e.type + '</span>' +
        '</div>';
      }).join('');
    };


    window.updateScrubber = function(val) {
      var hrs = Math.floor(val);
      var mins = Math.round((val - hrs) * 60);
      document.getElementById('scrubberTime').innerText = hrs + ':' + (mins < 10 ? '0' + mins : mins);
      window.renderTimeline(parseFloat(val));
    };


    window.parseWhatsAppMessage = async function() {
      var rawText = document.getElementById('waRawInput').value.trim();
      if (!rawText) return alert('Please paste the WhatsApp dispatch text first.');
      var statusEl = document.getElementById('waParseStatus');
      statusEl.innerHTML = '<span class="text-cyan-600 dark:text-cyan-400 animate-pulse font-bold">Gemini analyzing mine telemetry...</span>';


      var res = await fetch('/api/cr/parse-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawText, userRole: (window.curUser || {}).role })
      });
      var d = await res.json();
      if (!res.ok) return alert(d.error || 'Parsing error');


      document.getElementById('prodTonnes').value = d.extracted.muckedTonnes || 0;
      document.getElementById('prodSkips').value = d.extracted.skipsHoisted || 0;
      document.getElementById('prodMeters').value = d.extracted.drilledMeters || 0;
      statusEl.innerHTML = '<span class="text-emerald-600 dark:text-emerald-400 font-bold">&#x2714; ' + d.extracted.summary + '</span>';
      window.fetchState();
    };


    window.commitProductionUpdate = async function() {
      var res = await fetch('/api/cr/update-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftCode: document.getElementById('prodShiftCode').value,
          muckedTonnes: document.getElementById('prodTonnes').value,
          skipsHoisted: document.getElementById('prodSkips').value,
          drilledMeters: document.getElementById('prodMeters').value,
          breakdownMins: document.getElementById('prodBreakdown').value,
          userRole: window.curUser.role,
          reportedBy: window.curUser.name
        })
      });
      var d = await res.json();
      if (!res.ok) return alert(d.error || 'Update failed');
      alert(d.message);
      window.fetchState();
    };


    window.generateOptimalAllocation = async function() {
      var res = await fetch('/api/allocation/recommend');
      var d = await res.json();
      (d.recommendations || []).forEach(function(rec) {
        var el = document.getElementById('sel-' + rec.taskId);
        if (el) el.value = rec.recommendedToken;
      });
      alert('Allocation computed per DGMS safety and productivity metrics.');
    };


    window.saveSingleAllocation = async function(taskId) {
      var el = document.getElementById('sel-' + taskId);
      var tokenNo = el ? el.value : null;
      if (!tokenNo || !window.curUser) return alert('Select a worker first and ensure you are logged in.');


      var res = await fetch('/api/allocation/apply-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: taskId, tokenNo: tokenNo, userRole: window.curUser.role,
          userEmail: window.curUser.email, requestingSection: window.curUser.section || 'General Operations'
        })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) return alert(d.error || 'Allocation failed');
      alert(d.message || 'Allocation completed.');
      window.fetchState();
    };


    window.approveRecovery = async function() {
      if (!window.curUser) return alert('Please log in first.');
      var res = await fetch('/api/sic/dispatch-mip', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userRole: window.curUser.role, approvedBy: window.curUser.name })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) return alert(d.error || 'Recovery failed.');
      alert(d.message || 'MIP Recovery Dispatched.');
      window.fetchState();
    };


    window.activateTeleremoteHandover = async function() {
      if (!window.curUser) return alert('Please log in first.');
      var res = await fetch('/api/sic/teleremote-handover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userRole: window.curUser.role })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) return alert(d.error || 'Handover failed.');
      alert(d.message);
      window.fetchState();
    };


    window.escalateBreakdown = async function(id, tier) {
      if (!window.curUser) return alert('Please log in first.');
      var res = await fetch('/api/breakdown/escalate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ breakdownId: id, targetTier: tier, userRole: window.curUser.role })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) return alert(d.error || 'Escalation failed.');
      alert(d.message);
      window.fetchState();
    };


    window.sendAi = async function() {
      var input = document.getElementById('aiCmd');
      var prompt = (input ? input.value : '').trim();
      if (!prompt) return alert('Please enter a command first.');
      var msgEl = document.getElementById('aiMsg');
      msgEl.innerHTML = '<span class="text-purple-600 dark:text-purple-400 animate-pulse font-bold">Gemini AI executing command...</span>';


      var res = await fetch('/api/ai/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt, userRole: (window.curUser || {}).role })
      });
      var d = await res.json().catch(function() { return {}; });
      msgEl.innerText = d.message || 'Executed.';
      if (input) input.value = '';
    };


    document.addEventListener('DOMContentLoaded', function() {
      var saved = localStorage.getItem('vajra_theme');
      if (saved === 'light') window.toggleTheme();
    });
  </script>
</head>
<body class="min-h-screen flex flex-col justify-between selection:bg-amber-500 selection:text-black">


  <div class="fixed top-4 right-4 z-50 flex items-center gap-2">
    <button onclick="toggleTheme()" class="px-3.5 py-1.5 rounded-full text-xs font-bold border transition flex items-center gap-2 glass-card text-amber-600 dark:text-amber-400 border-slate-300 dark:border-slate-700 hover:border-amber-500 shadow-md">
      <span id="themeIcon">&#x2600;</span>
      <span id="themeLabel">Light Mode</span>
    </button>
  </div>


  <!-- SCREEN 1: LANDING -->
  <div id="screen-landing" class="min-h-screen flex flex-col items-center justify-center p-6 text-center">
    <div class="relative w-32 h-32 mb-6 flex items-center justify-center">
      <div class="absolute inset-0 rounded-3xl border-2 border-amber-500/40 dark:border-amber-500/30"></div>
      <div class="absolute inset-2 rounded-2xl border border-dashed border-cyan-500/60 dark:border-cyan-400/50 animate-spin" style="animation-duration: 25s;"></div>
      <svg class="w-14 h-14 text-amber-500 dark:text-amber-400 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
    </div>


    <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full sub-card text-[11px] text-amber-700 dark:text-amber-400 uppercase tracking-widest font-bold mb-4">
      <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
      HZL AI Hackathon 2026 &bull; Zawarmala Underground Complex
    </div>


    <h1 class="text-4xl md:text-6xl font-black tracking-widest text-slate-900 dark:text-white mb-2">V A J R A</h1>
    <p class="text-xs text-cyan-600 dark:text-cyan-400 font-extrabold tracking-widest uppercase mb-3">Short Interval Control &bull; Productivity Target: 51T &rarr; 60T Metal/yr/Person</p>
    <p class="text-xs text-slate-600 dark:text-slate-400 max-w-lg mb-8 leading-relaxed">
      Automated SIC Dispatch &bull; Real-Time Hourly Plan vs Actual &bull; 40-Equipment Fleet Status Ledger &bull; Upcoming Shift Face Planning &bull; DGMS Statutory Handover
    </p>


    <div class="flex gap-4">
      <button onclick="nav('login')" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 px-8 rounded-xl text-xs uppercase tracking-widest glow-amber transition transform hover:-translate-y-0.5">
        Enter Command Console &rarr;
      </button>
      <button onclick="nav('signup')" class="sub-card hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold py-3.5 px-8 rounded-xl text-xs uppercase tracking-widest transition">
        Provision Role
      </button>
    </div>
  </div>


  <!-- SCREEN 2: LOGIN -->
  <div id="screen-login" class="hidden min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-md glass-card rounded-2xl p-8 text-xs shadow-xl">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Console Authentication</h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Select authenticated operational role</p>
        </div>
        <button onclick="nav('landing')" class="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white">&larr; Return</button>
      </div>


      <form onsubmit="event.preventDefault(); doLogin();" class="space-y-4">
        <div>
          <label class="block text-slate-600 dark:text-slate-400 mb-1.5 uppercase font-semibold">Clearance Role</label>
          <select id="loginRole" class="w-full theme-input border rounded-lg p-3 outline-none focus:border-amber-500">
            <option value="control_room">Control Room Reporting Officer</option>
            <option value="shift_incharge">Shift Incharge (Control Room)</option>
            <option value="admin">Administrator (Mine Manager &amp; Arbitrator)</option>
            <option value="foreman">Section Foreman (North / South Beats)</option>
            <option value="bp_incharge">BP Incharge (AAC Operations Deck)</option>
            <option value="oem_rep">OEM Representative (Komatsu / CAT / Epiroc / Sandvik / GHH)</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-600 dark:text-slate-400 mb-1.5 uppercase font-semibold">Operational ID (Email)</label>
          <input id="loginEmail" type="email" value="incharge@hzl.com" class="w-full theme-input border rounded-lg p-3 outline-none focus:border-amber-500">
        </div>
        <div>
          <label class="block text-slate-600 dark:text-slate-400 mb-1.5 uppercase font-semibold">Security PIN / Password</label>
          <input id="loginPass" type="password" value="123" class="w-full theme-input border rounded-lg p-3 outline-none focus:border-amber-500">
        </div>


        <button type="button" id="loginButton" onclick="doLogin()" class="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold py-3.5 rounded-lg text-xs uppercase tracking-wider transition mt-2 glow-cyan">
          Authenticate Clearance
        </button>
      </form>
        <div class="pt-4 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500">
          <div class="mb-2 uppercase tracking-wider font-semibold text-slate-700 dark:text-slate-300">Quick Test Credentials:</div>
          <div class="flex flex-wrap gap-2">
            <button type="button" onclick="fastRole('control_room', 'cr.reporting@hzl.com')" class="px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 font-bold">Control Room</button>
            <button type="button" onclick="fastRole('admin', 'manager@hzl.com')" class="px-2.5 py-1 rounded bg-purple-100 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300 font-bold">Mine Manager</button>
            <button type="button" onclick="fastRole('shift_incharge', 'incharge@hzl.com')" class="px-2.5 py-1 rounded bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-300 font-bold">Shift Incharge</button>
            <button type="button" onclick="fastRole('foreman', 'foreman.north@hzl.com')" class="px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold">Foreman North</button>
          </div>
        </div>
      </div>
    </div>
  </div>


  <!-- SCREEN 3: SIGNUP -->
  <div id="screen-signup" class="hidden min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-md glass-card rounded-2xl p-8 text-xs shadow-xl">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">Provision Role</h2>
        <button onclick="nav('landing')" class="text-slate-500 hover:text-slate-900 dark:hover:text-white">&larr; Return</button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">FULL NAME</label>
          <input id="suName" type="text" placeholder="e.g. Dushyant Tailor" class="w-full theme-input border rounded-lg p-2.5 outline-none">
        </div>
        <div>
          <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">EMAIL</label>
          <input id="suEmail" type="email" placeholder="user@vedanta.co.in" class="w-full theme-input border rounded-lg p-2.5 outline-none">
        </div>
        <div>
          <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">ROLE</label>
          <select id="suRole" class="w-full theme-input border rounded-lg p-2.5 outline-none">
            <option value="control_room">Control Room Reporting Officer</option>
            <option value="shift_incharge">Shift Incharge</option>
            <option value="admin">Administrator</option>
            <option value="foreman">Section Foreman</option>
            <option value="bp_incharge">BP Incharge</option>
            <option value="oem_rep">OEM Representative</option>
          </select>
        </div>
        <button onclick="nav('login')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3 rounded-lg text-xs uppercase tracking-wider mt-3">Register Profile</button>
      </div>
    </div>
  </div>


  <!-- SCREEN 4: COMMAND CONSOLE DASHBOARD -->
  <div id="screen-app" class="hidden p-6 flex-1 flex flex-col">
    <header class="flex flex-wrap justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-800 gap-4 text-xs">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center font-black text-slate-950 text-sm glow-amber">V</div>
        <div>
          <div class="text-sm font-black tracking-widest text-slate-900 dark:text-white flex items-center gap-2">
            <span>VAJRA Vehicle, Asset & Job Roster Administration</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 font-bold">LIVE SYNC</span>
          </div>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">SHIFT B (16:00 - 00:00) &bull; TARGET 51T &rarr; 60T METAL/YR/PERSON &bull; HZL ZAWARMALA COMPLEX</p>
        </div>
      </div>


      <div class="flex items-center gap-4">
        <div class="sub-card px-3.5 py-1.5 rounded-xl flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-cyan-500 animate-ping"></span>
          <span id="userCount" class="font-extrabold text-cyan-600 dark:text-cyan-400">1</span>
          <span class="text-slate-500 dark:text-slate-400 text-[10px] font-bold">OPERATORS CONNECTED</span>
        </div>


        <div class="glass-card px-3.5 py-1.5 rounded-xl text-right">
          <div id="uName" class="font-bold text-slate-900 dark:text-white text-xs">--</div>
          <div id="uRoleBadge" class="text-[10px] font-extrabold uppercase tracking-wider">--</div>
        </div>


        <button onclick="nav('landing')" class="sub-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg border font-bold">Exit</button>
      </div>
    </header>


    <!-- Navigation Tabs -->
    <nav class="flex gap-1.5 my-4 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs overflow-x-auto">
      <button onclick="tab('kpis')" id="tab-kpis" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">★ Target &amp; KPIs</button>
      <button onclick="tab('breakdownlogs')" id="tab-breakdownlogs" class="px-3 py-2 rounded-xl text-amber-500 hover:text-amber-400 whitespace-nowrap font-black flex items-center gap-1">
        <span>⚡</span> Fleet Breakdown &amp; Status Logs 
      </button>
      <button onclick="tab('upcomingplan')" id="tab-upcomingplan" class="px-3 py-2 rounded-xl text-cyan-500 hover:text-cyan-400 whitespace-nowrap font-black flex items-center gap-1">
        <span>🎯</span> Upcoming Shift Face &amp; Task Planner
      </button>
      <button onclick="tab('losstree')" id="tab-losstree" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">1. Loss Tree</button>
      <button onclick="tab('faces')" id="tab-faces" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">2. Face Readiness</button>
      <button onclick="tab('sic')" id="tab-sic" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">3. SIC Recovery</button>
      <button onclick="tab('hourly')" id="tab-hourly" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">4. Hourly Plan</button>
      <button onclick="tab('tasks')" id="tab-tasks" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">5. Shift Tasks</button>
      <button onclick="tab('cr')" id="tab-cr" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">6. WhatsApp</button>
      <button onclick="tab('roster')" id="tab-roster" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">7. 434 Workforce</button>
      <button onclick="tab('gantt')" id="tab-gantt" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">8. Replay</button>
      <button onclick="tab('traffic')" id="tab-traffic" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">9. Decline Bays</button>
      <button onclick="tab('oem')" id="tab-oem" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">10. OEM Stats</button>
      <button onclick="tab('shiftend')" id="tab-shiftend" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold">11. DGMS Log</button>
      <button onclick="tab('copilot')" id="tab-copilot" class="px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap font-bold flex items-center gap-1">
        <span class="text-purple-600 dark:text-purple-400 font-bold">&#x2728;</span> 12. AI Copilot
      </button>
    </nav>


    <!-- TAB: TARGET & KPIS -->
    <div id="pane-kpis" class="space-y-6 text-xs">
      <div class="glass-card rounded-2xl p-6 border">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div class="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
              HZL AI Hackathon 2026 Primary Target
            </div>
            <h2 class="text-2xl font-black text-slate-900 dark:text-white">
              Metal Production per Person: <span id="rateVal">52.6</span> <span class="text-base font-normal text-slate-500">/ 60.0 T/person/yr</span>
            </h2>
            <p class="text-slate-600 dark:text-slate-400 text-xs mt-1">
              Baseline: 51.0 T &bull; Target: 60.0 T (+17.6% lift via Short Interval Control &amp; Predictive Fleet Availability)
            </p>
          </div>
          <div class="w-full md:w-64">
            <div class="flex justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
              <span>Shift Progress</span>
              <span>87.6%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
              <div id="rateBar" class="bg-gradient-to-r from-cyan-500 to-amber-500 h-full transition-all duration-700" style="width: 87.6%;"></div>
            </div>
          </div>
        </div>
      </div>


      <div class="glass-card rounded-2xl p-6 border space-y-4">
        <div>
          <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Secondary KPI Scorecard (Target Impact Tracking)</h3>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Live operational variance vs. HZL Hackathon secondary KPI targets.</p>
        </div>
        <div id="secondaryKpiGrid" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>
      </div>
    </div>


    <!-- NEW TAB : FLEET BREAKDOWN & STATUS LOGS  -->
    <div id="pane-breakdownlogs" class="hidden space-y-6 text-xs">
      <!-- Status Counters Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="sub-card p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div class="text-[10px] font-bold text-slate-500 uppercase">Total HEMM Fleet</div>
          <div id="cntFleetTotal" class="text-2xl font-black text-slate-900 dark:text-white mt-1">40</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Zawarmala Active</div>
        </div>
        <div class="sub-card p-4 rounded-xl border border-emerald-200 dark:border-emerald-950">
          <div class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">OK / Active</div>
          <div id="cntFleetOk" class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">--</div>
          <div class="text-[10px] text-slate-500 mt-0.5">In operational cycle</div>
        </div>
        <div class="sub-card p-4 rounded-xl border border-amber-200 dark:border-amber-950">
          <div class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Idle Machines</div>
          <div id="cntFleetIdle" class="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">--</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Standby / Starved</div>
        </div>
        <div class="sub-card p-4 rounded-xl border border-red-200 dark:border-red-950">
          <div class="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">Breakdowns</div>
          <div id="cntFleetBreakdown" class="text-2xl font-black text-red-600 dark:text-red-400 mt-1">--</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Unscheduled repairs</div>
        </div>
        <div class="sub-card p-4 rounded-xl border border-purple-200 dark:border-purple-950">
          <div class="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">GC Due</div>
          <div id="cntFleetGcDue" class="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">--</div>
          <div class="text-[10px] text-slate-500 mt-0.5">General Check 250/500h</div>
        </div>
        <div class="sub-card p-4 rounded-xl border border-blue-200 dark:border-blue-950">
          <div class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Maintenance</div>
          <div id="cntFleetMaintenance" class="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">--</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Workshop scheduled</div>
        </div>
      </div>


      <!-- Log Breakdown / Status Update Form Card -->
      <div id="logBreakdownForm" class="glass-card rounded-2xl p-5 border space-y-4">
        <div class="flex justify-between items-center">
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span class="text-amber-500">&#x26A1;</span> Log Machine Breakdown &amp; Status Update
            </h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Record failure reason, downtime minutes, ETR, and set machine status to OK, Idle, Breakdown, GC Due, or Maintenance.
            </p>
          </div>
          <span class="px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800 text-[10px] font-bold">REAL-TIME TELEMETRY</span>
        </div>


        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Select Machine (Whiteboard Fleet)</label>
            <select id="logMachineSel" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-amber-500"></select>
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Target Status</label>
            <select id="logStatusSel" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-amber-500">
              <option value="breakdown">🔴 Breakdown (Unscheduled Downtime)</option>
              <option value="gc_due">🟣 GC Due (General Check / Periodic PM)</option>
              <option value="idle">🟡 Idle (Operational Standby / Awaiting Face)</option>
              <option value="maintenance">🔵 Maintenance (Workshop Scheduled Service)</option>
              <option value="active">🟢 OK / Active (Operational In Shift)</option>
            </select>
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Subsystem Category</label>
            <select id="logCategorySel" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-amber-500">
              <option value="MECHANICAL">Mechanical / Articulation</option>
              <option value="HYDRAULIC">Hydraulic Hose / Cylinder / Pump</option>
              <option value="ELECTRICAL">Electrical / Starter / Battery</option>
              <option value="TRANSMISSION">Transmission / Torque Converter</option>
              <option value="PNEUMATIC">Pneumatic / Air Header</option>
              <option value="GENERAL_CHECK">General Check / Periodic PM Inspection</option>
              <option value="IDLE_OPERATIONAL">Operational Idle / Waiting Face Muck</option>
              <option value="CHUTE_CRUSHER">Chute / Crusher / Rockbolt Jam</option>
              <option value="SAFETY">DGMS Statutory Safety Audit</option>
            </select>
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Severity &amp; Priority</label>
            <select id="logSeveritySel" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-amber-500">
              <option value="CRITICAL">CRITICAL (Direct Takt Halter)</option>
              <option value="HIGH">HIGH (Secondary Bottleneck)</option>
              <option value="MEDIUM">MEDIUM (Reroutable)</option>
              <option value="LOW">LOW (Minor Defect)</option>
            </select>
          </div>
        </div>


        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div class="md:col-span-2">
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Failure / Status Reason</label>
            <input id="logReasonInput" type="text" placeholder="e.g. Hydraulic boom feed cylinder burst / 250-Hr GC overdue / Steering cylinder eye sheared" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-amber-500">
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Sublevel (mRL)</label>
            <input id="logLevelRl" type="number" value="250" class="w-full theme-input border rounded-lg p-2.5 text-xs">
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Delay (min)</label>
              <input id="logDelayMins" type="number" value="45" class="w-full theme-input border rounded-lg p-2.5 text-xs">
            </div>
            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">ETR</label>
              <input id="logEtr" type="text" value="30 mins" class="w-full theme-input border rounded-lg p-2.5 text-xs">
            </div>
          </div>
        </div>


        <div class="flex justify-end pt-1">
          <button onclick="submitBreakdownLog()" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-6 py-2.5 rounded-xl uppercase text-xs tracking-wider transition glow-amber shadow-md">
            Commit Machine Status &amp; Log Breakdown &rarr;
          </button>
        </div>
      </div>


      <!-- Fleet Roster & Filter Controls -->
      <div class="glass-card rounded-2xl p-5 border space-y-4">
        <div class="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Zawarmala HEMM Fleet Ledger (Whiteboard Vehicles &amp; Equipment)
            </h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              11 LPDTs, 7 LHDs, 8 Drills, 8 Utilities/Services &amp; 6 Additional Vehicles.
            </p>
          </div>


          <!-- Category Filters -->
          <div class="flex flex-wrap gap-1.5">
            <button id="cat-btn-ALL" onclick="filterFleetCategory('ALL')" class="px-3 py-1 rounded-lg text-xs font-black bg-amber-500 text-slate-950">ALL (40)</button>
            <button id="cat-btn-LPDT" onclick="filterFleetCategory('LPDT')" class="px-3 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">LPDT (11)</button>
            <button id="cat-btn-LHD" onclick="filterFleetCategory('LHD')" class="px-3 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">LHD (7)</button>
            <button id="cat-btn-DRILL" onclick="filterFleetCategory('DRILL')" class="px-3 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">DRILLS (8)</button>
            <button id="cat-btn-UTILITY" onclick="filterFleetCategory('UTILITY')" class="px-3 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">UTILITY (8)</button>
            <button id="cat-btn-ADDITIONAL" onclick="filterFleetCategory('ADDITIONAL')" class="px-3 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">ADDITIONAL (6)</button>
          </div>
        </div>


        <!-- Status Filter Sub-Bar -->
        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px]">
          <span class="text-slate-500 font-semibold uppercase text-[10px]">Filter Status:</span>
          <button id="stat-btn-ALL" onclick="filterFleetStatus('ALL')" class="px-2.5 py-1 rounded-lg text-xs font-black bg-cyan-600 text-white">ALL</button>
          <button id="stat-btn-active" onclick="filterFleetStatus('active')" class="px-2.5 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">🟢 OK / Active</button>
          <button id="stat-btn-idle" onclick="filterFleetStatus('idle')" class="px-2.5 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">🟡 Idle</button>
          <button id="stat-btn-breakdown" onclick="filterFleetStatus('breakdown')" class="px-2.5 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">🔴 Breakdown</button>
          <button id="stat-btn-gc_due" onclick="filterFleetStatus('gc_due')" class="px-2.5 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">🟣 GC Due</button>
          <button id="stat-btn-maintenance" onclick="filterFleetStatus('maintenance')" class="px-2.5 py-1 rounded-lg text-xs font-semibold sub-card text-slate-600 dark:text-slate-300">🔵 Maintenance</button>
        </div>


        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2 text-[10px]">
              <tr>
                <th class="pb-2">CODE</th>
                <th class="pb-2">CATEGORY</th>
                <th class="pb-2">MODEL &amp; OEM</th>
                <th class="pb-2">CAPACITY</th>
                <th class="pb-2">LEVEL</th>
                <th class="pb-2">STATUS</th>
                <th class="pb-2">STATUS REASON / FAULT DETAILS</th>
                <th class="pb-2">GC DUE DATE</th>
                <th class="pb-2">OPERATOR</th>
                <th class="pb-2 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody id="fleetTableBody" class="divide-y divide-slate-200 dark:divide-slate-800 text-xs"></tbody>
          </table>
        </div>
      </div>


      <!-- Active Breakdown Logs Ledger -->
      <div class="glass-card rounded-2xl p-5 border space-y-3">
        <h4 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
          Breakdown &amp; Service Event History Log
        </h4>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2 text-[10px]">
              <tr>
                <th class="pb-2">LOG ID</th>
                <th class="pb-2">MACHINE</th>
                <th class="pb-2">EVENT TYPE</th>
                <th class="pb-2">REASON &amp; ROOT CAUSE</th>
                <th class="pb-2">DOWNTIME</th>
                <th class="pb-2">ETR</th>
                <th class="pb-2">SEVERITY</th>
                <th class="pb-2">ESCALATION</th>
                <th class="pb-2">REPORTED BY</th>
                <th class="pb-2 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody id="breakdownLogsTableBody" class="divide-y divide-slate-200 dark:divide-slate-800 text-xs"></tbody>
          </table>
        </div>
      </div>
    </div>


    <!-- NEW TAB 14: UPCOMING SHIFT FACE & TASK PLANNER -->
    <div id="pane-upcomingplan" class="hidden space-y-6 text-xs">
      <!-- Section Header -->
      <div class="glass-card rounded-2xl p-6 border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div class="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest mb-1">
            Short Interval Control &bull; Next Shift Planning Module
          </div>
          <h2 class="text-xl font-black text-slate-900 dark:text-white">
            Upcoming Shift Target Face &amp; Task Planning
          </h2>
          <p class="text-slate-600 dark:text-slate-400 text-xs mt-1">
            Target specific heading faces (430-DEV-01, 418-EXT-02, 250-DRIVE-R, -130-WEST-04, etc.), allocate 40-HEMM fleet assets, and plan advance meters &amp; tonnage targets for upcoming Shift C (00:00 - 08:00).
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span class="sub-card px-3.5 py-2 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 border">
            Planning Horizon: Shift C (00:00 - 08:00)
          </span>
        </div>
      </div>


      <!-- Targeted Faces Cards -->
      <div class="space-y-3">
        <h3 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
          Targeted Heading Faces Status &amp; Upcoming Shift Forecast
        </h3>
        <div id="targetedFacesCards" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
      </div>


      <!-- Add Task for Upcoming Shift Form -->
      <div class="glass-card rounded-2xl p-5 border space-y-4">
        <div class="flex justify-between items-center">
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span class="text-cyan-500">&#x1F4CB;</span> Schedule Task &amp; Target Face for Upcoming Shift
            </h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Assign face heading, machine, operator, and planned advance metrics.
            </p>
          </div>
          <span class="px-2.5 py-1 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800 text-[10px] font-bold">DISPATCH READY</span>
        </div>


        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Target Shift</label>
            <select id="upShiftCode" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500">
              <option value="C">Shift C (00:00 - 08:00) [Upcoming Night Shift]</option>
              <option value="A">Shift A (08:00 - 16:00) [Morning Shift]</option>
              <option value="B">Shift B (16:00 - 00:00) [Evening Shift]</option>
            </select>
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Target Heading Face</label>
            <select id="upFaceSel" onchange="handleFaceSelectChange(this.value)" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500"></select>
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Sublevel (mRL)</label>
            <input id="upLevelRl" type="number" value="430" class="w-full theme-input border rounded-lg p-2.5 text-xs">
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Task Category</label>
            <select id="upTaskCategory" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500">
              <option value="FACE_DRILL">Face Drilling &amp; Blasting (Jumbo / Drill)</option>
              <option value="HEMM_MUCKING">HEMM Mucking &amp; Haulage (LHD / LPDT)</option>
              <option value="SUPPORTING">Rockbolting &amp; Shotcreting Support</option>
              <option value="STATUTORY_BEAT">Statutory Gas / Roof Testing (Mate)</option>
              <option value="CRUSHER_FEED">Crusher Feeder / Grizzly Operation</option>
              <option value="GENERAL_CHECK">Preventive Maintenance / GC Service</option>
              <option value="UTILITY_SUPPORT">Ventilation / Sump Dewatering Support</option>
            </select>
          </div>
        </div>


        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div class="md:col-span-2">
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Task Title / Objective</label>
            <input id="upTaskTitle" type="text" placeholder="e.g. Shift C: 430-DEV-01 Heading Advance Drilling & Burn Cut" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500">
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Deploy Machine (From 40 Fleet)</label>
            <select id="upMachineSel" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500"></select>
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Required Role</label>
            <select id="upRequiredRole" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500">
              <option value="HEMM_OPERATOR">HEMM Operator (LHD / LPDT / Jumbo / Drill)</option>
              <option value="STATUTORY_MATE">Statutory Mining Mate</option>
              <option value="MAINTENANCE_TRADE">Maintenance Trade (Fitter / Electrician / Welder)</option>
              <option value="UG_CREW">Underground Crew / Helper</option>
            </select>
          </div>
        </div>


        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Assign Operator / Crew</label>
            <select id="upWorkerSel" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500"></select>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Target Meters (m)</label>
              <input id="upTargetMeters" type="number" step="0.1" value="4.2" class="w-full theme-input border rounded-lg p-2.5 text-xs">
            </div>
            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Target Ore (T)</label>
              <input id="upTargetTonnes" type="number" value="320" class="w-full theme-input border rounded-lg p-2.5 text-xs">
            </div>
          </div>
          <div>
            <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Priority</label>
            <select id="upPriority" class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500">
              <option value="CRITICAL_P1">CRITICAL P1 (Shift Critical Path)</option>
              <option value="HIGH_P2">HIGH P2 (Key Stope / Haulage)</option>
              <option value="MEDIUM_P3">MEDIUM P3 (Support / Secondary)</option>
              <option value="LOW_P4">LOW P4 (Routine Sump / Housekeeping)</option>
            </select>
          </div>
          <div class="flex items-center gap-3 pt-5">
            <label class="flex items-center gap-2 cursor-pointer font-bold text-amber-600 dark:text-amber-400">
              <input id="upIsTeleremote" type="checkbox" class="w-4 h-4 rounded accent-amber-500">
              <span>Hazardous / Teleremote</span>
            </label>
          </div>
        </div>


        <div>
          <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Operational &amp; DGMS Safety Notes</label>
          <input id="upNotes" type="text" placeholder="e.g. Ensure post-blast gas clearance test verified by Mining Mate before entering heading." class="w-full theme-input border rounded-lg p-2.5 text-xs outline-none focus:border-cyan-500">
        </div>


        <div class="flex justify-end pt-1">
          <button onclick="submitUpcomingTask()" class="bg-cyan-600 hover:bg-cyan-500 text-white font-black px-6 py-2.5 rounded-xl uppercase text-xs tracking-wider transition glow-cyan shadow-md">
            Add Task to Upcoming Shift Plan &rarr;
          </button>
        </div>
      </div>


      <!-- Upcoming Shift Tasks Schedule Table -->
      <div class="glass-card rounded-2xl p-5 border space-y-3">
        <h4 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
          Scheduled Tasks for Upcoming Shift
        </h4>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2 text-[10px]">
              <tr>
                <th class="pb-2">PRIORITY</th>
                <th class="pb-2">TASK TITLE</th>
                <th class="pb-2">TARGET FACE / LOCATION</th>
                <th class="pb-2">ASSIGNED MACHINE</th>
                <th class="pb-2">ASSIGNED OPERATOR</th>
                <th class="pb-2">TARGET METRICS</th>
                <th class="pb-2">STATUS</th>
              </tr>
            </thead>
            <tbody id="upcomingTasksTableBody" class="divide-y divide-slate-200 dark:divide-slate-800 text-xs"></tbody>
          </table>
        </div>
      </div>
    </div>


    <!-- TAB 1: SHIFT LOSS TREE -->
    <div id="pane-losstree" class="hidden space-y-6 text-xs">
      <div class="glass-card rounded-2xl p-6 border space-y-4">
        <div>
          <div class="text-[11px] font-extrabold text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">
            Root-Cause Productivity Loss Attribution
          </div>
          <h3 class="text-lg font-black text-slate-900 dark:text-white">
            Shift B Cumulative Production Deficit: <span id="ltTotal" class="text-red-600 dark:text-red-400 font-extrabold">--</span>
          </h3>
          <p class="text-slate-600 dark:text-slate-400 text-xs">Tonnage lost across mining value chain bottlenecks before Short Interval Intervention.</p>
        </div>


        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
          <div class="sub-card p-4 rounded-xl border border-red-200 dark:border-red-950">
            <div class="text-[10px] font-bold text-slate-500 uppercase">Mechanical Breakdowns</div>
            <div id="ltBreakdown" class="text-2xl font-black text-red-600 dark:text-red-400 mt-1">--</div>
            <p class="text-[10px] text-slate-500 mt-1">MJ-5, EMT-6, SL-1 repairs</p>
          </div>
          <div class="sub-card p-4 rounded-xl border border-amber-200 dark:border-amber-950">
            <div class="text-[10px] font-bold text-slate-500 uppercase">Ramp / Traffic Chokes</div>
            <div id="ltRamp" class="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">--</div>
            <p class="text-[10px] text-slate-500 mt-1">CL-19 stall @ 228 mRL</p>
          </div>
          <div class="sub-card p-4 rounded-xl border border-purple-200 dark:border-purple-950">
            <div class="text-[10px] font-bold text-slate-500 uppercase">Crusher Rockbolt Jams</div>
            <div id="ltCrusher" class="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">--</div>
            <p class="text-[10px] text-slate-500 mt-1">Primary feeder plate obstruction</p>
          </div>
          <div class="sub-card p-4 rounded-xl border border-cyan-200 dark:border-cyan-950">
            <div class="text-[10px] font-bold text-slate-500 uppercase">Workforce Short-Punch</div>
            <div id="ltWorkforce" class="text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1">--</div>
            <p class="text-[10px] text-slate-500 mt-1">Operator fatigue lockouts</p>
          </div>
          <div class="sub-card p-4 rounded-xl border border-emerald-200 dark:border-emerald-950">
            <div class="text-[10px] font-bold text-slate-500 uppercase">Cold Face Starvation</div>
            <div id="ltFaces" class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">--</div>
            <p class="text-[10px] text-slate-500 mt-1">Cleared faces awaiting LHD</p>
          </div>
        </div>
      </div>


      <div class="glass-card rounded-2xl p-5 border space-y-4">
        <h4 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Multi-Tier Escalation SLA Matrix</h4>
        <div id="escalationBreakdowns" class="space-y-3"></div>
      </div>
    </div>


    <!-- TAB 2: FACE READINESS & COLD FACES -->
    <div id="pane-faces" class="hidden space-y-6 text-xs">
      <div class="glass-card rounded-2xl p-5 border overflow-x-auto space-y-4">
        <div class="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Heading Readiness &amp; Cold Face Utilization Cycle</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Automated alerting on faces cleared of blast fumes but lacking mucking/drilling assets.</p>
          </div>
          <button onclick="activateTeleremoteHandover()" class="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-400 text-white font-extrabold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition glow-cyan">
            <span>&#x26A1;</span> Authorize Blast-Window Teleremote Handover
          </button>
        </div>


        <table class="w-full text-left">
          <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2">
            <tr>
              <th class="pb-2.5">HEADING / LEVEL</th>
              <th class="pb-2.5">CYCLE STAGE</th>
              <th class="pb-2.5">ASSIGNED MACHINE</th>
              <th class="pb-2.5">STATUTORY MATE</th>
              <th class="pb-2.5">PROGRESS</th>
              <th class="pb-2.5 text-right">UTILIZATION STATUS</th>
            </tr>
          </thead>
          <tbody id="faceTableBody" class="divide-y divide-slate-200 dark:divide-slate-800"></tbody>
        </table>
      </div>
    </div>


    <!-- TAB 3: LIVE SIC RECOVERY -->
    <div id="pane-sic" class="hidden space-y-6 text-xs">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="glass-card p-5 rounded-2xl border">
          <div class="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">Crushed Ore Bin (COB) Fill</div>
          <div id="cobVal" class="text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">29.6%</div>
          <p class="text-[10px] text-slate-500 mt-1">Starvation warning threshold &lt; 35%</p>
        </div>


        <div class="glass-card p-5 rounded-2xl border">
          <div class="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">Monte Carlo Target Forecast</div>
          <div id="mcVal" class="text-3xl font-black text-cyan-600 dark:text-cyan-400 mt-1">64.8%</div>
          <p class="text-[10px] text-slate-500 mt-1">Probability of hitting 2,100 T shift plan</p>
        </div>


        <div class="glass-card p-5 rounded-2xl border">
          <div class="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">Heading Advance Compliance</div>
          <div id="advVal" class="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">91.2%</div>
          <p class="text-[10px] text-slate-500 mt-1">Target benchmark &gt; 95%</p>
        </div>
      </div>


      <div class="glass-card rounded-2xl p-6 border border-amber-500/60 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 glow-amber">
        <div>
          <div class="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            MIP Dynamic Recovery Work Order #ZM-2026-B
          </div>
          <h3 class="text-sm font-black text-slate-900 dark:text-white">CL-19 Steering Stall @ 228 mRL Decline &amp; Primary Crusher Jam</h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Divert haulers GT 10 &amp; EMT-1 to 265 mRL stope (Loader GL-8 active). Deploy gas-cutter Munna (800110) to clear crusher rockbolt. Recovers +4.8T metal yield to drive takt to 58.6 T/person/yr.
          </p>
        </div>


        <button id="btnApprove" onclick="approveRecovery()" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-6 rounded-xl text-xs uppercase tracking-wider transition shadow-md">
          Approve &amp; Dispatch Order
        </button>
      </div>
    </div>


    <!-- TAB 4: HOURLY PLAN VS ACTUAL -->
    <div id="pane-hourly" class="hidden space-y-6 text-xs">
      <div class="glass-card rounded-2xl p-5 border overflow-x-auto">
        <div class="flex justify-between items-center mb-4">
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Short Interval Control: Hourly Interval Plan vs Actual</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Shift B (16:00 - 00:00) interval production run-rate with automated bottleneck tagging.</p>
          </div>
          <span class="sub-card px-3 py-1 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-300">HZL Zawarmala Fleet FMS Sync</span>
        </div>


        <table class="w-full text-left">
          <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2">
            <tr>
              <th class="pb-2.5">INTERVAL</th>
              <th class="pb-2.5">HOURLY PLAN</th>
              <th class="pb-2.5">ACTUAL TONNES</th>
              <th class="pb-2.5">VARIANCE</th>
              <th class="pb-2.5">BOTTLENECK IDENTIFIED</th>
              <th class="pb-2.5">AI RECOVERY WORK ORDER</th>
            </tr>
          </thead>
          <tbody id="hourlyPlanBody" class="divide-y divide-slate-200 dark:divide-slate-800"></tbody>
        </table>
      </div>
    </div>


    <!-- TAB 5: TASK MATRIX & MANPOWER ALLOCATION -->
    <div id="pane-tasks" class="hidden space-y-6 text-xs">
      <div class="glass-card rounded-2xl p-5 border flex flex-wrap justify-between items-center gap-4">
        <div>
          <div class="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
            Dynamic Priority Queue &amp; Fatigue-Gated Manpower Dispatch
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Tasks ranked P1 to P4. Workers must be confirmed <strong>INSIDE MINE</strong> via portal turnstile RFID. Short-punch and high-fatigue operators are auto-restricted from hazardous teleremote rigs.
          </p>
        </div>
        <div>
          <button onclick="generateOptimalAllocation()" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-6 rounded-xl text-xs uppercase tracking-wider transition glow-amber flex items-center gap-2">
            <span>&#x26A1;</span> Recommend Effective Allocation
          </button>
        </div>
      </div>


      <div class="glass-card rounded-2xl p-5 border overflow-x-auto">
        <table class="w-full text-left">
          <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2">
            <tr>
              <th class="pb-2.5">PRIORITY</th>
              <th class="pb-2.5">TASK TITLE</th>
              <th class="pb-2.5">LEVEL</th>
              <th class="pb-2.5">MACHINE / BEAT</th>
              <th class="pb-2.5">ROLE REQUIRED</th>
              <th class="pb-2.5">ASSIGNED WORKER (EDITABLE)</th>
              <th class="pb-2.5 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody id="taskTableBody" class="divide-y divide-slate-200 dark:divide-slate-800"></tbody>
        </table>
      </div>
    </div>


    <!-- TAB 6: WHATSAPP DISPATCH INGESTION -->
    <div id="pane-cr" class="hidden space-y-6 text-xs">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="glass-card rounded-2xl p-5 border space-y-4">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span class="text-emerald-500 text-base">&#x1F4AC;</span> WhatsApp Dispatch Ingestion (Gemini-Powered)
              </h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Parse shift parameters from underground field group broadcasts.</p>
            </div>
            <span class="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold">GEMINI NLU</span>
          </div>


          <textarea id="waRawInput" rows="6" placeholder="Paste WhatsApp message here... Example:&#10;Shift B Handover: GT 10 & GT 15 mucked 1479 tonnes. Longhole Simba drilled 98.0 mtr. Skips hoisted 39. Crusher running smooth, ramp clear. Add new task to muck waste from 430 mRL." class="w-full theme-input border rounded-xl p-3 outline-none focus:border-amber-500"></textarea>


          <div class="flex justify-between items-center">
            <button onclick="parseWhatsAppMessage()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-5 py-2.5 rounded-xl uppercase tracking-wider transition">
              Analyze Parameters with Gemini &rarr;
            </button>
            <div id="waParseStatus" class="text-slate-500 text-[11px]"></div>
          </div>
        </div>


        <div class="glass-card rounded-2xl p-5 border space-y-4">
          <div>
            <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Shift Production Window &amp; Statutory Lockout</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Shift A (08-16h), B (16-00h), C (00-08h) &bull; Auto-locks 1 hr post shift end.</p>
          </div>


          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Active Shift</label>
                <select id="prodShiftCode" class="w-full theme-input border rounded-lg p-2.5 outline-none focus:border-amber-500">
                  <option value="B">Shift B (16:00 - 00:00) [Current]</option>
                  <option value="A">Shift A (08:00 - 16:00)</option>
                  <option value="C">Shift C (00:00 - 08:00)</option>
                </select>
              </div>
              <div>
                <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Skips Hoisted</label>
                <input id="prodSkips" type="number" value="39" class="w-full theme-input border rounded-lg p-2.5">
              </div>
            </div>


            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Mucked Ore (Tonnes)</label>
                <input id="prodTonnes" type="number" value="1479" class="w-full theme-input border rounded-lg p-2.5">
              </div>
              <div>
                <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Drilled Meters</label>
                <input id="prodMeters" type="number" step="0.1" value="98.0" class="w-full theme-input border rounded-lg p-2.5">
              </div>
            </div>


            <div>
              <label class="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Total Breakdown Downtime (Minutes)</label>
              <input id="prodBreakdown" type="number" value="217" class="w-full theme-input border rounded-lg p-2.5">
            </div>


            <button onclick="commitProductionUpdate()" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl uppercase tracking-wider transition glow-amber">
              Commit Shift Telemetry &bull; Transmit to DGMS Handover
            </button>
          </div>
        </div>
      </div>


      <div class="glass-card rounded-2xl p-5 border overflow-x-auto">
        <h4 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider mb-3">Statutory Shift Lockout Status &amp; Compliance Audit</h4>
        <table class="w-full text-left">
          <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2">
            <tr>
              <th class="pb-2">SHIFT INTERVAL</th>
              <th class="pb-2">OPERATING HOURS</th>
              <th class="pb-2">1-HR LOCKOUT EXPIRY</th>
              <th class="pb-2">MUCKED TONNES</th>
              <th class="pb-2">DRILLED METERS</th>
              <th class="pb-2">REPORTED BY</th>
              <th class="pb-2 text-right">LOCKOUT STATUS</th>
            </tr>
          </thead>
          <tbody id="shiftRecordsTableBody" class="divide-y divide-slate-200 dark:divide-slate-800"></tbody>
        </table>
      </div>
    </div>


    <!-- TAB 7: 434 WORKFORCE & FATIGUE LOG -->
    <div id="pane-roster" class="hidden glass-card rounded-2xl p-5 border text-xs space-y-4">
      <div>
        <h2 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">AAC 434-Person Roster, RFID Gate Status &amp; Fatigue Attribution</h2>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Individual short-punch hours lost, teleremote disqualification status, and tonnage benchmarking.</p>
      </div>


      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2">
            <tr>
              <th class="pb-2.5">TOKEN NO</th>
              <th class="pb-2.5">WORKER NAME</th>
              <th class="pb-2.5">CATEGORY</th>
              <th class="pb-2.5">RFID GATE</th>
              <th class="pb-2.5">FATIGUE STATUS</th>
              <th class="pb-2.5">PRODUCTIVITY ATTRIBUTION</th>
              <th class="pb-2.5">ASSIGNED BEAT / RIG</th>
              <th class="pb-2.5 text-right">GATE STATUS</th>
            </tr>
          </thead>
          <tbody id="rosterBody" class="divide-y divide-slate-200 dark:divide-slate-800"></tbody>
        </table>
      </div>
    </div>


    <!-- TAB 8: SHIFT REPLAY SCRUBBER -->
    <div id="pane-gantt" class="hidden glass-card rounded-2xl p-5 border text-xs space-y-5">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Shift B (16:00 - 00:00) Operations Timeline &amp; Replay Scrubber</h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Micro-delay progression and prescriptive recovery work orders.</p>
        </div>
        <div class="text-right">
          <span class="text-slate-500 dark:text-slate-400 font-semibold">REPLAY SCRUBBER: </span>
          <span id="scrubberTime" class="text-amber-600 dark:text-amber-400 font-extrabold text-sm">19:30</span>
        </div>
      </div>


      <div class="sub-card p-4 rounded-xl">
        <input id="timelineSlider" type="range" min="16" max="24" step="0.25" value="19.5" oninput="updateScrubber(this.value)" class="w-full accent-amber-500 cursor-pointer">
      </div>


      <div id="timelineEventsContainer" class="space-y-3"></div>
    </div>


    <!-- TAB 9: DECLINE BAYS & TRAMMING -->
    <div id="pane-traffic" class="hidden glass-card rounded-2xl p-5 border text-xs space-y-4">
      <div>
        <h2 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Decline Ramp Tramming Slots &amp; Anti-Bunching Bays</h2>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Single-lane decline clearance control and right-of-way management.</p>
      </div>


      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="sub-card p-4 rounded-xl">
          <div class="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase mb-2">PASSING BAY 245 mRL</div>
          <div class="text-lg font-black text-slate-900 dark:text-white mb-1">GT 15 (20T Hauler)</div>
          <p class="text-[10px] text-slate-500">Yielding right-of-way to ascending loaded hauler MT-5.</p>
        </div>


        <div class="sub-card p-4 rounded-xl">
          <div class="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 uppercase mb-2">PASSING BAY 228 mRL</div>
          <div class="text-lg font-black text-slate-900 dark:text-white mb-1">GT 11 &amp; EMT-5</div>
          <p class="text-[10px] text-slate-500">Clearance bypass established around broken loader CL-19.</p>
        </div>


        <div class="sub-card p-4 rounded-xl">
          <div class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-2">MAIN DECLINE NORTH (UP)</div>
          <div class="text-lg font-black text-slate-900 dark:text-white mb-1">EMT-1 (Ascending)</div>
          <p class="text-[10px] text-slate-500">Speed: 14 km/h | Engine: 1,800 RPM | Gradient: 1:7 Incline.</p>
        </div>
      </div>
    </div>


    <!-- TAB 10: OEM TELEMETRY -->
    <div id="pane-oem" class="hidden glass-card rounded-2xl p-5 border text-xs space-y-6">
      <div>
        <h2 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">OEM Telemetry Benchmarks (MTBF / MTTR)</h2>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Active CAN telemetry reliability stats across GHH, Epiroc, Gainwell, Sandvik, AAC &amp; Normet.</p>
      </div>


      <div id="oemGrid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"></div>
    </div>


    <!-- TAB 11: DGMS SHIFT LOG -->
    <div id="pane-shiftend" class="hidden glass-card rounded-2xl p-5 border text-xs space-y-5">
      <div class="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Shift-End Consolidation &amp; DGMS Statutory Handover</h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">One-click compliance reporting with verified Mining Mate statutory beats.</p>
        </div>
        <a href="/api/reports/dgms-csv" class="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-5 py-2.5 rounded-xl uppercase text-xs tracking-wider inline-flex items-center gap-2 transition">
          <span>&#x1F4BE;</span> Export DGMS Shift Log (CSV)
        </a>
      </div>
      <div class="sub-card p-5 rounded-2xl">
        <h3 class="font-bold text-slate-900 dark:text-white mb-2">Statutory Shift Handover Checklist</h3>
        <ul class="space-y-2 text-slate-700 dark:text-slate-300">
          <li class="flex items-center gap-2">&#x2714; Mining Mate beats allocated across all working sublevels.</li>
          <li class="flex items-center gap-2">&#x2714; Turnstile attendance matched against 434-person register.</li>
          <li class="flex items-center gap-2">&#x2714; All 40 HEMM vehicles verified for status (OK, Idle, Breakdown, GC Due).</li>
          <li class="flex items-center gap-2">&#x2714; Upcoming Shift C face targets and task schedule locked.</li>
          <li class="flex items-center gap-2">&#x2714; Haulage tonnage validated via skips hoisted and secondary crushing bins.</li>
        </ul>
      </div>
    </div>


    <!-- TAB 12: AI COPILOT -->
    <div id="pane-copilot" class="hidden max-w-2xl mx-auto space-y-4 w-full text-xs">
      <div class="glass-card border border-purple-500/40 rounded-2xl p-6 space-y-4">
        <div>
          <h2 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span class="text-purple-600 dark:text-purple-400 font-bold">&#x2728;</span> AI Operational Copilot (VAJRA-Command)
          </h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Connected to Gemini. Dispatch complex multi-asset work orders and resolve underground operational constraints.
          </p>
        </div>


        <div id="aiInputBox" class="flex gap-2">
          <input id="aiCmd" type="text" placeholder="e.g. Divert haulers into passing bays to clear decline jam" class="flex-1 theme-input border rounded-xl p-3 outline-none focus:border-purple-500">
          <button onclick="sendAi()" class="bg-purple-600 hover:bg-purple-500 text-white font-extrabold px-6 py-3 rounded-xl uppercase tracking-wider transition">Execute</button>
        </div>
        <div id="aiMsg" class="text-emerald-600 dark:text-emerald-400 font-extrabold text-xs"></div>
      </div>
    </div>
  </div>
</body>
</html>`);
});


// Final Express error boundary
app.use((err: any, _req: Request, res: Response, _next: Function) => {
  console.error("Unhandled request error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error." });
});


const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`==================================================`);
  console.log(`VAJRA Control Room online at http://localhost:${PORT}`);
  console.log(`==================================================`);
});


server.on("error", (err: any) => {
  console.error("Server listener error:", err);
});


process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});


process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  if (!server.listening) process.exit(1);
});


process.on("SIGINT", () => {
  console.log("\nShutting down VAJRA Control Room...");
  server.close(() => process.exit(0));
});


export default app;

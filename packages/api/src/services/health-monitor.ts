import { loadavg, totalmem, freemem, cpus, uptime as osUptime } from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { createConnection } from "node:net";

const execFile = promisify(execFileCb);

/**
 * System health metrics shape.
 */
export interface SystemHealth {
  cpu: {
    loadAvg1m: number;
    loadAvg5m: number;
    cores: number;
  };
  memory: {
    totalMB: number;
    freeMB: number;
    usedPercent: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    usedPercent: number;
  };
  uptime: number;
  services: ServiceStatus[];
}

export interface ServiceStatus {
  name: string;
  status: "up" | "down" | "unknown";
}

export interface ServiceEntry {
  name: string;
  port: number;
  host: string;
}

/**
 * Check if a port is reachable on a given host within a timeout.
 */
export function checkPort(
  port: number,
  host: string,
  timeout: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host, timeout });

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Get disk usage by parsing `df -k /` output.
 */
async function getDiskUsage(): Promise<{
  totalGB: number;
  usedGB: number;
  usedPercent: number;
}> {
  try {
    const { stdout } = await execFile("df", ["-k", "/"], { timeout: 5000 });
    const lines = stdout.trim().split("\n");
    // Second line contains the data
    const dataLine = lines[1];
    if (!dataLine) {
      return { totalGB: 0, usedGB: 0, usedPercent: 0 };
    }

    // Split by whitespace -- columns: Filesystem, 1K-blocks, Used, Available, Use%, Mounted
    const parts = dataLine.split(/\s+/);
    const totalKB = parseInt(parts[1] ?? "0", 10);
    const usedKB = parseInt(parts[2] ?? "0", 10);

    const totalGB = Math.round((totalKB / 1024 / 1024) * 10) / 10;
    const usedGB = Math.round((usedKB / 1024 / 1024) * 10) / 10;
    const usedPercent =
      totalKB > 0 ? Math.round((usedKB / totalKB) * 1000) / 10 : 0;

    return { totalGB, usedGB, usedPercent };
  } catch {
    return { totalGB: 0, usedGB: 0, usedPercent: 0 };
  }
}

/**
 * Collect system health metrics including CPU, memory, disk, uptime,
 * and per-service port check status.
 */
export async function getSystemHealth(
  serviceList: ServiceEntry[]
): Promise<SystemHealth> {
  // CPU
  const [loadAvg1m, loadAvg5m] = loadavg();
  const cores = cpus().length;

  // Memory
  const totalBytes = totalmem();
  const freeBytes = freemem();
  const totalMB = Math.round(totalBytes / 1024 / 1024);
  const freeMB = Math.round(freeBytes / 1024 / 1024);
  const usedPercent =
    totalBytes > 0
      ? Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10
      : 0;

  // Disk
  const disk = await getDiskUsage();

  // Uptime
  const uptimeSeconds = osUptime();

  // Service checks
  const serviceResults = await Promise.allSettled(
    serviceList.map(async (svc) => {
      const isUp = await checkPort(svc.port, svc.host, 2000);
      return {
        name: svc.name,
        status: isUp ? ("up" as const) : ("down" as const),
      };
    })
  );

  const services: ServiceStatus[] = serviceResults.map((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return { name: "unknown", status: "unknown" as const };
  });

  return {
    cpu: {
      loadAvg1m: loadAvg1m ?? 0,
      loadAvg5m: loadAvg5m ?? 0,
      cores,
    },
    memory: {
      totalMB,
      freeMB,
      usedPercent,
    },
    disk,
    uptime: uptimeSeconds,
    services,
  };
}

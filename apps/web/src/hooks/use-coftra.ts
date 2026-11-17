"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { getDeployment } from "@/lib/contracts";
import { readFundingHealth, readReactiveRequests, readTask, readTaskIds, readTasks, readVaultLogs } from "@/lib/reads";

export const deploymentInfo = getDeployment();

export function useMyTasks() {
  const { address } = useAccount();
  const d = deploymentInfo;
  return useQuery({
    queryKey: ["myTasks", address],
    enabled: !!d && !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { ids, owned } = await readTaskIds(d!, address!);
      const tasks = await readTasks(d!, ids);
      return { tasks, owned };
    },
  });
}

export function useTask(id: bigint | null) {
  const d = deploymentInfo;
  return useQuery({
    queryKey: ["task", id?.toString()],
    enabled: !!d && id !== null,
    refetchInterval: 10_000,
    queryFn: () => readTask(d!, id!),
  });
}

export function useVaultLogs() {
  const d = deploymentInfo;
  return useQuery({
    queryKey: ["vaultLogs"],
    enabled: !!d,
    refetchInterval: 20_000,
    queryFn: () => readVaultLogs(d!),
  });
}

export function useReactiveRequests() {
  const d = deploymentInfo;
  return useQuery({
    queryKey: ["reactiveRequests"],
    enabled: !!d,
    refetchInterval: 20_000,
    // ~2 days of Lasna blocks; older requests are matched from the destination side.
    queryFn: () => readReactiveRequests(d!, { lookbackBlocks: 160_000n }),
  });
}

export function useFunding() {
  const d = deploymentInfo;
  return useQuery({
    queryKey: ["funding"],
    enabled: !!d,
    refetchInterval: 30_000,
    queryFn: () => readFundingHealth(d!),
  });
}

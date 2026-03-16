import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";
import type { ProgressPayload } from "@/lib/types";
import { buildVersionPath } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";
import { useAppFolder } from "./use-app-folder";
import { installedVersionsQueryKey } from "./use-installed-versions";

export const useInstallBundledVersion = () => {
	const { appFolder } = useAppFolder();
	const { versionsParent, versionsSubdir } = useSettingsStore();
	const queryClient = useQueryClient();
	const listenRef = useRef<UnlistenFn>(null);

	return useMutation({
		mutationFn: async () => {
			if (!appFolder) throw new Error("App folder not found");
			// On extrait vers un dossier spécifique "1.21.6-local" pour éviter les conflits
			const versionPath = buildVersionPath(
				versionsParent ?? appFolder,
				"1.21.6-local",
				versionsSubdir,
			);
			const emitevent = `extract-bundled-1_21_6_local`;

			return invoke("extract_bundled_archive", {
				destpath: versionPath,
				emitevent,
			}) as Promise<string>;
		},
		onError: (error) => {
			listenRef.current?.();
			toast.error(`Error extracting bundled version: ${error.message}`, {
				id: `install-bundled-version`,
			});
		},
		onMutate: async () => {
			const emitevent = `extract-bundled-1_21_6_local`;
			toast.loading(`Extracting bundled local version...`, {
				id: `install-bundled-version`,
			});
			listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
				const { phase, percent } = event.payload;
				if (phase === "extract" && percent) {
					toast.loading(`Extracting local version: ${percent.toFixed(0)}%`, {
						id: `install-bundled-version`,
					});
				}
			});
		},
		onSuccess: async () => {
			listenRef.current?.();
			await queryClient.invalidateQueries({
				queryKey: installedVersionsQueryKey(),
			});
			toast.success(`Local game version installed successfully`, {
				id: `install-bundled-version`,
			});
		},
	});
};

import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const lockedModsQueryKey = (installationPath: string) => [
	"locked-mods",
	installationPath,
];

export const useLockedMods = (installationPath: string) => {
	return useQuery({
		enabled: !!installationPath,
		queryFn: () =>
			invoke("get_locked_mods", { path: installationPath }) as Promise<
				string[]
			>,
		queryKey: lockedModsQueryKey(installationPath),
	});
};

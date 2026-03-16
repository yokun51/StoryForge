import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const disabledModsQueryKey = (installationPath: string) => [
	"disabled-mods",
	installationPath,
];

export const useDisabledMods = (installationPath: string) => {
	return useQuery({
		enabled: !!installationPath,
		queryFn: () =>
			invoke("get_disabled_mods", { path: installationPath }) as Promise<
				string[]
			>,
		queryKey: disabledModsQueryKey(installationPath),
	});
};

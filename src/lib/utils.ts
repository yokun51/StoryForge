import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { platform } from "@tauri-apps/plugin-os";
import { type ClassValue, clsx } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import type { OutputMod } from "@/routes/install-mods/$id";
import type { Installation } from "@/stores/installations";
import type { Release } from "./types";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function capitalizeFirstLetter(string: string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

// On s'assure ici que la chaîne est trim() avant d'être formatée pour un dossier
export function makeStringFolderSafe(string: string) {
	return string
		.trim()
		.replace(/[^a-z0-9]/gi, "_")
		.toLowerCase();
}

function parseVer(v: string) {
	const parts = String(v).trim().split(".");
	const major = Number(parts[0] ?? 0) || 0;
	const minor = Number(parts[1] ?? 0) || 0;
	const patch = Number(parts[2] ?? 0) || 0;
	return [major, minor, patch];
}

export function compareSemverDesc(a: string, b: string) {
	const [ma, mi, pa] = parseVer(a);
	const [mb, mj, pb] = parseVer(b);
	if (ma !== mb) return mb - ma;
	if (mi !== mj) return mj - mi;
	return pb - pa;
}

export function compareSemverAsc(a: string, b: string) {
	const [ma, mi, pa] = parseVer(a);
	const [mb, mj, pb] = parseVer(b);
	if (ma !== mb) return ma - mb;
	if (mi !== mj) return mi - mj;
	return pa - pb;
}

export const zipfolderprefix = () => {
	const currentPlatform = platform();
	const pf = currentPlatform.charAt(0).toLowerCase();
	if (pf === "w") return "app/";
	if (pf === "m") return "*.app/";
	return "";
};

export const isMac = platform() === "macos";

export const modifierLabel = isMac ? "⌘" : "Ctrl+";

export const isWindows = platform() === "windows";

export const pathDelimiter = isWindows ? "\\" : "/";

export function buildInstallationsPath(
	parentPath: string,
	subdir = "installations",
): string {
	return `${parentPath}${pathDelimiter}${subdir}`;
}

export function buildVersionsPath(
	parentPath: string,
	subdir = "versions",
): string {
	return `${parentPath}${pathDelimiter}${subdir}`;
}

export function buildInstallationPath(
	parentPath: string,
	installationName: string,
	subdir = "installations",
): string {
	return `${parentPath}${pathDelimiter}${subdir}${pathDelimiter}${installationName}`;
}

export function buildVersionPath(
	parentPath: string,
	versionName: string,
	subdir = "versions",
): string {
	return `${parentPath}${pathDelimiter}${subdir}${pathDelimiter}${versionName}`;
}

export const sortInstallations = (a: Installation, b: Installation) => {
	if (a.favorite && !b.favorite) return -1;
	if (!a.favorite && b.favorite) return 1;
	const aTime = a.lastTimePlayed ? new Date(a.lastTimePlayed).getTime() : 0;
	const bTime = b.lastTimePlayed ? new Date(b.lastTimePlayed).getTime() : 0;
	return bTime - aTime;
};

export const exportInstallation = async ({
	installation,
}: {
	installation: Installation;
}) => {
	const installationMods = await invoke<{ mods: OutputMod[] }>("get_mods", {
		path: installation.path,
	});
	const disabledMods = await invoke<string[]>("get_disabled_mods", {
		path: installation.path,
	});

	const data = {
		mods: installationMods.mods.map((m) => {
			const isDisabled = disabledMods.some(
				(d) => d === m.modid.toString() || d.startsWith(`${m.modid}@`),
			);
			return {
				disabled: isDisabled,
				id: m.modid,
				version: m.version,
			};
		}),
		name: installation.name,
		version: installation.version,
	};
	await writeText(JSON.stringify(data, null, 2));
	toast.success("Installation copied to clipboard");
};

export const itemVariants = {
	exit: { opacity: 0, transition: { duration: 0.15 }, y: -4 },
	hidden: { opacity: 0, y: 8 },
	show: (i: number) => ({
		opacity: 1,
		transition: {
			damping: 32,
			delay: i * 0.05,
			stiffness: 420,
			type: "spring" as const,
		},
		y: 0,
	}),
};

export function getTargetRelease(
	releases: Release[],
	targetGameVersion: string,
): Release | undefined {
	return releases.find((release) =>
		release.tags.some((tag) => compareSemverAsc(tag, targetGameVersion) <= 0),
	);
}

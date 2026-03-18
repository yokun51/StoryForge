import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstallBundledVersion } from "@/hooks/use-install-bundled-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { gameVersionsQuery } from "@/lib/queries";
import {
	buildInstallationPath,
	compareSemverDesc,
	makeStringFolderSafe,
	pathDelimiter,
} from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import {
	type Installation,
	useInstallationsStore,
} from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";
import { installationSchema } from "./addinstallation.dialog";

export type EditInstallationDialogProps = {
	installation: Installation;
};

export function EditInstallationDialog({
	open,
	installation,
}: {
	open: boolean;
} & EditInstallationDialogProps) {
	const id = useId();
	const { data: gameVersions } = useQuery(gameVersionsQuery);
	const { closeDialog } = useDialogStore();
	const { data: installedVersionsData } = useInstalledVersions();
	const { appFolder } = useAppFolder();

	const {
		installationsParent,
		installationsSubdir,
		useLocalProfile,
		localPlayerName,
		localPlayerUid,
		localUserEmail,
	} = useSettingsStore();

	const { updateInstallation } = useInstallationsStore();
	const { mutateAsync: downloadVersion, isPending: isDownloading } =
		useDownloadVersion();
	const { mutateAsync: installBundledVersion, isPending: isExtractingLocal } =
		useInstallBundledVersion();

	const isPending = isDownloading || isExtractingLocal;
	const installedVersions = installedVersionsData?.map((v) => v.trim()) ?? [];

	const BUNDLED_LOCAL_VERSION = "1.21.6-local";

	const cleanGameVersions = gameVersions?.map((v) => v.trim()) ?? [];
	const officialVersions = cleanGameVersions.sort(compareSemverDesc);
	const availableVersions = useLocalProfile
		? [BUNDLED_LOCAL_VERSION, ...officialVersions]
		: officialVersions;

	const displayVersions = Array.from(
		new Set([...availableVersions, installation.version?.trim()]),
	).filter(Boolean) as string[];

	const form = useForm({
		defaultValues: {
			favorite: installation.favorite,
			icon: installation.icon?.trim() ?? "",
			id: installation.id,
			index: installation.index,
			name: installation.name.trim(),
			path: installation.path.trim(),
			startParams: installation.startParams?.trim() ?? "",
			version:
				installation.version?.trim() ??
				(useLocalProfile
					? BUNDLED_LOCAL_VERSION
					: (availableVersions[0] ?? "1.21.1")),
		},
		onSubmit: async ({ value }) => {
			const actualVersionToInstall = value.version.trim();
			const finalName = value.name.trim();

			if (!installedVersions.includes(actualVersionToInstall)) {
				if (actualVersionToInstall === BUNDLED_LOCAL_VERSION) {
					await installBundledVersion();
				} else {
					await downloadVersion(actualVersionToInstall);
				}
			}

			// Ne générer le clientsettings local QUE si la version choisie est la 1.21.6-local
			if (useLocalProfile && actualVersionToInstall === BUNDLED_LOCAL_VERSION) {
				const clientSettingsObj = {
					boolSettings: {
						allowSettingHRTFaudio: true,
						allowSSBOs: true,
						alwaysOnTop: false,
						ambientParticles: true,
						autoChat: true,
						autoChatOpenSelected: true,
						bloom: true,
						chatdialogvisible: true,
						developerMode: false,
						directMouseMode: true,
						disableModSafetyCheck: false,
						dynamicColorGrading: true,
						extendedDebugInfo: false,
						flipScreenshot: true,
						focusWindowOnModInstallRequest: true,
						force48khzHRTFaudio: true,
						forceUdpOverTcp: false,
						fxaa: true,
						glDebugMode: false,
						hasGameServer: false,
						highQualityAnimations: true,
						immersiveMouseMode: false,
						invertMouseYAxis: false,
						liquidFoamAndShinyEffect: true,
						multipleInstances: false,
						newSeraphVoices: true,
						noHandbookPause: false,
						occlusionculling: true,
						offThreadMipMaps: false,
						pauseGameOnLostFocus: false,
						renderClouds: true,
						renderMetaBlocks: false,
						renderParticles: true,
						scaleScreenshot: false,
						selectedBlockOutline: true,
						separateCtrlKeyForMouse: false,
						showBlockInfoHud: true,
						showBlockInteractionHelp: true,
						showCoordinateHud: true,
						showCreativeHelpDialog: true,
						showentitydebuginfo: false,
						showMinimapHud: true,
						showModdedServers: true,
						showMoreGfxOptions: true,
						showOpenForAllServers: true,
						showPasswordProtectedServers: true,
						showSurvivalHelpDialog: true,
						showWhitelistedServers: true,
						skipNvidiaProfileCheck: false,
						smoothShadows: true,
						startupErrorDialog: false,
						testGlExtensions: true,
						toggleSprint: true,
						transparentRenderPass: true,
						useHRTFaudio: false,
						viewBobbing: true,
						volumetricshading_deferredLighting: false,
						volumetricshading_SSRCaustics: true,
						volumetricshading_SSRRainReflections: true,
						volumetricshading_SSRRefractions: true,
						volumetricshading_screenSpaceReflections: false,
						volumetricshading_underwaterTweaks: true,
						wavingStuff: true,
					},
					dialogPositions: { "toolmodeselect512054, 110, 512056": null },
					floatSettings: {
						ambientBloomLevel: 0.2,
						blockAtlasSubPixelPadding: 0.01,
						brightnessLevel: 1.0,
						cameraShakeStrength: 0.2,
						extraContrastLevel: 0.0,
						extraGammaLevel: 1.0,
						fontSize: 1.0,
						fpHandsYOffset: 0.0,
						gameTickFrameRate: -1.0,
						gammaLevel: 3.0,
						guiScale: 1.0,
						instabilityWavingStrength: 0.1,
						itemAtlasSubPixelPadding: 0.0,
						lodBias: 0.33,
						lodBiasFar: 0.85,
						megaScreenshotSizeMul: 2.0,
						minbrightness: 0.0,
						mouseWheelSensivity: 1.0,
						previewTransparency: 0.3,
						recordingFrameRate: 30.0,
						sepiaLevel: 0.0,
						ssaa: 1.0,
						swimmingMouseSmoothing: 0.9,
						wireframethickness: 1.0,
					},
					intSettings: {
						ambientSoundLevel: 100,
						archiveLogFileCount: 5,
						archiveLogFileMaxSizeMb: 1024,
						chatWindowHeight: 200,
						chatWindowWidth: 700,
						chunkVerticesUploadRateLimiter: 3,
						cloudRenderMode: 1,
						entitySoundLevel: 100,
						fieldOfView: 70,
						fpHandsFoV: 75,
						gameWindowMode: 2,
						godRays: 1,
						graphicsPresetId: 11,
						guiColorsPreset: 1,
						itemCollectMode: 0,
						leftDialogMargin: 0,
						masterSoundLevel: 100,
						maxAnimatedElements: 230,
						maxAsyncCubeParticles: 80000,
						maxAsyncQuadParticles: 80000,
						maxCubeParticles: 4000,
						maxDynamicLights: 50,
						maxFps: 142,
						maxQuadParticles: 8000,
						maxTextureAtlasHeight: 4096,
						maxTextureAtlasWidth: 4096,
						minimapHudPosition: 0,
						mipmapLevel: 3,
						modelDataPoolMaxIndexSize: 750000,
						modelDataPoolMaxParts: 1500,
						modelDataPoolMaxVertexSize: 500000,
						mouseSensivity: 61,
						mouseSmoothing: 30,
						musicFrequency: 2,
						musicLevel: 10,
						optimizeRamMode: 1,
						particleLevel: 100,
						recordingBufferSize: 60,
						rightDialogMargin: 0,
						schematicMaxUploadSizeKb: 200,
						screenHeight: 928,
						screenshotExifDataMode: 0,
						screenWidth: 1312,
						shadowMapQuality: 3,
						soundLevel: 100,
						ssaoQuality: 2,
						viewDistance: 512,
						volumetricshading_farPeterPanningAdjustment: 5,
						volumetricshading_nearPeterPanningAdjustment: 2,
						volumetricshading_nearShadowBaseWidth: 15,
						volumetricshading_overexposureIntensity: 0,
						volumetricshading_SSRReflectionDimming: 110,
						volumetricshading_SSRSkyMixin: 10,
						volumetricshading_SSRSplashTransparency: 55,
						volumetricshading_SSRTintInfluence: 35,
						volumetricshading_SSRWaterTransparency: 25,
						volumetricshading_softShadowSamples: 16,
						volumetricshading_volumetricLightingFlatness: 120,
						volumetricshading_volumetricLightingIntensity: 30,
						vsyncMode: 1,
						weatherSoundLevel: 100,
						webRequestTimeout: 10,
						weirdMacOSMouseYOffset: 5,
						windowBorder: 2,
					},
					keyMapping: {
						ctrl: {
							Alt: false,
							Ctrl: false,
							KeyCode: 1,
							OnKeyUp: false,
							SecondKeyCode: null,
							Shift: false,
						},
						shift: {
							Alt: false,
							Ctrl: false,
							KeyCode: 3,
							OnKeyUp: false,
							SecondKeyCode: null,
							Shift: false,
						},
						sneak: {
							Alt: false,
							Ctrl: false,
							KeyCode: 3,
							OnKeyUp: false,
							SecondKeyCode: null,
							Shift: false,
						},
						sprint: {
							Alt: false,
							Ctrl: false,
							KeyCode: 1,
							OnKeyUp: false,
							SecondKeyCode: null,
							Shift: false,
						},
					},
					stringListSettings: {
						customPlayStyles: [],
						dialogPositions: [],
						disabledMods: [],
						modPaths: ["Mods", `${value.path.trim()}${pathDelimiter}Mods`],
						multiplayerservers: [],
					},
					stringSettings: {
						audioDevice:
							"OpenAL Soft on SteelSeries Sonar - Gaming (SteelSeries Sonar Virtual Audio Device)",
						currentHandbookCategoryCode: null,
						decorativeFontName: "Lora",
						defaultFontName: "sans-serif",
						entitlements: "",
						glContextVersion: "4.3",
						language: "en",
						lastSkinSelection:
							"baseskin:skin14,eyecolor:sand,underwear:twopiece,voicetype:oboe,voicepitch:high,hairbase:layered,hairextra:classicponytail,facialexpression:kind,mustache:mst-line15-eccentric,beard:brd-chin15-goatee,haircolor:harvestgold",
						masterserverUrl: "https://dev.fplay.su/api/v1/servers/",
						modDbUrl: "https://mods.vintagestory.at/",
						mptoken: null,
						playername: localPlayerName,
						playeruid: localPlayerUid,
						recordingCodec: "rawv",
						sessionkey: "1",
						sessionsignature: "1",
						settingsVersion: "1.15",
						useremail: localUserEmail,
					},
				};
				const clientSettingsStr = JSON.stringify(clientSettingsObj, null, 2);
				await invoke("initialize_game", {
					clientSettings: clientSettingsStr,
					path: value.path.trim(),
				});
			}

			updateInstallation(
				{
					favorite: value.favorite,
					icon: value.icon?.trim() ?? null,
					id: installation.id,
					index: installation.index,
					lastTimePlayed: installation.lastTimePlayed,
					name: finalName,
					path: value.path.trim(),
					startParams: value.startParams.trim(),
					totalTimePlayed: installation.totalTimePlayed,
					version: actualVersionToInstall,
				},
				async (status) => {
					if (status) {
						const safeName = makeStringFolderSafe(finalName);
						const oldSafeName = makeStringFolderSafe(installation.name);
						if (safeName === oldSafeName) {
							closeDialog();
							return;
						}
						await invoke("rename_installations_folder", {
							newName: safeName,
							source: installationsParent ?? appFolder ?? "",
							subdir: oldSafeName,
						});
						closeDialog();
					}
				},
			);
		},
		validators: {
			onChange: installationSchema,
		},
	});

	return (
		<Dialog
			onOpenChange={() =>
				!isPending && !form.state.isSubmitting && closeDialog()
			}
			open={open}
		>
			<DialogClose />
			<DialogContent>
				<div className="flex flex-col items-center gap-2">
					<DialogHeader>
						<DialogTitle className="sm:text-center">
							Edit installation
						</DialogTitle>
						<DialogDescription className="sm:text-center">
							Enter the installation's details.
						</DialogDescription>
					</DialogHeader>
				</div>

				<div className="space-y-5">
					<div className="space-y-4">
						<form.Field name="name">
							{(field) => (
								<div className="grid gap-2">
									<Tooltip>
										<TooltipTrigger
											render={
												<Label
													className={clsx([
														field.state.meta.errors.length
															? "text-destructive"
															: "",
														"w-fit",
													])}
													htmlFor="name"
												/>
											}
										>
											Name
											<span className="text-destructive">*</span>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Enter server name</p>
											{field.state.meta.errors.length > 0 &&
												field.state.meta.errors.map((error, index) => (
													<p
														className="text-destructive text-xs"
														key={error?.message?.toString() || index}
													>
														{error?.message}
													</p>
												))}
										</TooltipContent>
									</Tooltip>
									<Input
										className={
											field.state.meta.errors.length ? "text-destructive" : ""
										}
										onChange={(e) => {
											const trimmed = e.target.value.replace(/^\s+/, "");
											field.handleChange(trimmed);
											if (trimmed.length > 0 && appFolder) {
												const safeName = makeStringFolderSafe(trimmed);
												form.setFieldValue(
													"path",
													buildInstallationPath(
														installationsParent ?? appFolder,
														safeName,
														installationsSubdir,
													),
												);
											} else {
												form.resetField("path");
											}
										}}
										onKeyUp={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												form.handleSubmit();
											}
										}}
										value={field.state.value}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="startParams">
							{(field) => (
								<div className="grid gap-2">
									<div className="flex items-center">
										<Tooltip>
											<TooltipTrigger
												render={
													<Label
														className={clsx([
															field.state.meta.errors.length
																? "text-destructive"
																: "",
															"w-fit",
														])}
														htmlFor="startParams"
													/>
												}
											>
												Start parameters
												<span className="text-muted-foreground text-xs">
													(optional)
												</span>
											</TooltipTrigger>
											<TooltipContent align="start" side="bottom">
												<p className="text-xs">Enter start parameters</p>
												{field.state.meta.errors.length > 0 &&
													field.state.meta.errors.map((error, index) => (
														<p
															className="text-destructive text-xs"
															key={error?.message?.toString() || index}
														>
															{error?.message}
														</p>
													))}
											</TooltipContent>
										</Tooltip>
									</div>
									<Input
										id={`${id}-start-params`}
										onChange={(e) =>
											field.handleChange(e.target.value.replace(/^\s+/, ""))
										}
										onKeyUp={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												form.handleSubmit();
											}
										}}
										value={field.state.value}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="path">
							{(field) => (
								<div className="grid gap-2">
									<Tooltip>
										<TooltipTrigger
											render={
												<Label
													className={clsx([
														field.state.meta.errors.length
															? "text-destructive"
															: "",
														"w-fit",
													])}
													htmlFor="path"
												/>
											}
										>
											Path
											<span className="text-destructive">*</span>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Enter installation path</p>
											{field.state.meta.errors.length > 0 &&
												field.state.meta.errors.map((error, index) => (
													<p
														className="text-destructive text-xs"
														key={error?.message?.toString() || index}
													>
														{error?.message}
													</p>
												))}
										</TooltipContent>
									</Tooltip>
									<Input
										className={
											field.state.meta.errors.length ? "text-destructive" : ""
										}
										disabled
										value={field.state.value}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="icon">
							{(field) => (
								<div className="grid gap-2">
									<Tooltip>
										<TooltipTrigger
											render={
												<Label
													className={clsx([
														field.state.meta.errors.length
															? "text-destructive"
															: "",
														"w-fit",
													])}
													htmlFor="icon"
												/>
											}
										>
											Icon
											<span className="text-muted-foreground text-xs">
												(optional)
											</span>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Enter installation icon</p>
											{field.state.meta.errors.length > 0 &&
												field.state.meta.errors.map((error, index) => (
													<p
														className="text-destructive text-xs"
														key={error?.message?.toString() || index}
													>
														{error?.message}
													</p>
												))}
										</TooltipContent>
									</Tooltip>
									<Input
										className={
											field.state.meta.errors.length ? "text-destructive" : ""
										}
										onChange={(e) =>
											field.handleChange(e.target.value.replace(/^\s+/, ""))
										}
										onKeyUp={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												form.handleSubmit();
											}
										}}
										value={field.state.value ?? ""}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="version">
							{(field) => (
								<div className="grid gap-2">
									<Tooltip>
										<TooltipTrigger
											render={
												<Label
													className={clsx([
														field.state.meta.errors.length
															? "text-destructive"
															: "",
														"w-fit",
													])}
													htmlFor="version"
												/>
											}
										>
											Version
											<span className="text-destructive">*</span>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Pick game version</p>
											{field.state.meta.errors.length > 0 &&
												field.state.meta.errors.map((error, index) => (
													<p
														className="text-destructive text-xs"
														key={error?.message?.toString() || index}
													>
														{error?.message}
													</p>
												))}
										</TooltipContent>
									</Tooltip>
									<Select
										onValueChange={(v) => v && field.handleChange(v)}
										value={field.state.value}
									>
										<SelectTrigger className="flex gap-1 w-full truncate items-center text-left">
											<span className="truncate w-full block">
												{field.state.value ?? "Game version"}
												{installedVersions.includes(field.state.value) ? (
													<span className="text-xs text-muted-foreground opacity-50 ml-2">
														(installed)
													</span>
												) : (
													<span className="text-xs text-muted-foreground opacity-50 ml-2">
														(will be downloaded)
													</span>
												)}
											</span>
										</SelectTrigger>
										<SelectContent align="start" alignItemWithTrigger={false}>
											{displayVersions.map((version) => (
												<SelectItem
													className={
														installedVersions.includes(version)
															? "bg-success/5"
															: ""
													}
													key={version}
													value={version}
												>
													{version}
													{installedVersions.includes(version) && (
														<span className="text-xs text-muted-foreground opacity-50 ml-2">
															(installed)
														</span>
													)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{useLocalProfile && (
										<span className="text-xs text-muted-foreground">
											The Local Profile feature is <strong>only applied</strong>{" "}
											when using the{" "}
											<span className="text-warning-foreground">
												{BUNDLED_LOCAL_VERSION}
											</span>{" "}
											version.
										</span>
									)}
								</div>
							)}
						</form.Field>
					</div>
					<Button
						className="w-full"
						disabled={form.state.isSubmitting || isPending}
						onClick={() => form.handleSubmit()}
						type="button"
					>
						{form.state.isSubmitting || isPending
							? "Updating..."
							: "Update Installation"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

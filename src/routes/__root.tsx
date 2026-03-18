import { AppSidebar } from "@/components/sidebars/app.sidebar";
import "@/App.css";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import * as React from "react";
import { Toaster } from "sonner";
import { AddInstallationDialog } from "@/components/dialogs/addinstallation.dialog";
import { AddModDialog } from "@/components/dialogs/addmod.dialog";
import { AddServerDialog } from "@/components/dialogs/addserver.dialog";
import { AddUserDialog } from "@/components/dialogs/adduser.dialog";
import { AddVersionDialog } from "@/components/dialogs/addversion.dialog";
import { ConnectServerDialog } from "@/components/dialogs/connectserver.dialog";
import { DeleteInstallationDialog } from "@/components/dialogs/deleteinstallation.dialog";
import { DeleteServerDialog } from "@/components/dialogs/deleteserver.dialog";
import { DeleteVersionDialog } from "@/components/dialogs/deleteversion.dialog";
import { DeleteWorldDialog } from "@/components/dialogs/deleteworld.dialog";
import { DuplicateInstallationDialog } from "@/components/dialogs/duplicateinstallation.dialog";
import { EditInstallationDialog } from "@/components/dialogs/editinstallation.dialog";
import { EditServerDialog } from "@/components/dialogs/editserver.dialog";
import { EditWorldDialog } from "@/components/dialogs/editworld.dialog";
import { ImportInstallationDialog } from "@/components/dialogs/importinstallation.dialog";
import { ImportModsDialog } from "@/components/dialogs/importmods.dialog";
import { RemoveModDialog } from "@/components/dialogs/removemod.dialog";
import { RestoreWorldDialog } from "@/components/dialogs/restoreworld.dialog";
import { SaveModProfileDialog } from "@/components/dialogs/savemodprofile.dialog";
import { UpdateModDialog } from "@/components/dialogs/updatemod.dialog";
import { ViewMapDialog } from "@/components/dialogs/viewmap.dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { type DialogMap, useDialogStore } from "@/stores/dialogs";
import { useSettingsStore } from "@/stores/settings";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	component: RootComponent,
});

function RootComponent() {
	// Stores
	const { active } = useDialogStore();
	const { darkMode } = useSettingsStore();

	return (
		<React.Fragment>
			<AppSidebar />
			<main className="flex flex-1">
				<SidebarTrigger className="md:hidden h-full items-start pt-2 border-r" />
				<Outlet />
			</main>
			<TanStackDevtools
				plugins={[
					{
						name: "Query",
						render: <ReactQueryDevtoolsPanel />,
					},
					{
						name: "Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
				]}
			/>
			{active?.key === "AddInstallationDialog" && (
				<AddInstallationDialog
					open={active?.key === "AddInstallationDialog"}
					{...((active?.key === "AddInstallationDialog"
						? active.props
						: {}) as DialogMap["AddInstallationDialog"])}
				/>
			)}
			{active?.key === "AddModDialog" && (
				<AddModDialog
					open={active?.key === "AddModDialog"}
					{...((active?.key === "AddModDialog"
						? active.props
						: {}) as DialogMap["AddModDialog"])}
				/>
			)}
			{active?.key === "AddServerDialog" && (
				<AddServerDialog
					open={active?.key === "AddServerDialog"}
					{...((active?.key === "AddServerDialog"
						? active.props
						: {}) as DialogMap["AddServerDialog"])}
				/>
			)}
			{active?.key === "AddUserDialog" && (
				<AddUserDialog open={active?.key === "AddUserDialog"} />
			)}
			{active?.key === "AddVersionDialog" && (
				<AddVersionDialog open={active?.key === "AddVersionDialog"} />
			)}
			{active?.key === "ConnectServerDialog" && (
				<ConnectServerDialog
					open={active?.key === "ConnectServerDialog"}
					{...((active?.key === "ConnectServerDialog"
						? active.props
						: {}) as DialogMap["ConnectServerDialog"])}
				/>
			)}
			{active?.key === "DeleteInstallationDialog" && (
				<DeleteInstallationDialog
					open={active?.key === "DeleteInstallationDialog"}
					{...((active?.key === "DeleteInstallationDialog"
						? active.props
						: {}) as DialogMap["DeleteInstallationDialog"])}
				/>
			)}
			{active?.key === "DeleteServerDialog" && (
				<DeleteServerDialog
					open={active?.key === "DeleteServerDialog"}
					{...((active?.key === "DeleteServerDialog"
						? active.props
						: {}) as DialogMap["DeleteServerDialog"])}
				/>
			)}
			{active?.key === "DeleteVersionDialog" && (
				<DeleteVersionDialog
					open={active?.key === "DeleteVersionDialog"}
					{...((active?.key === "DeleteVersionDialog"
						? active.props
						: {}) as DialogMap["DeleteVersionDialog"])}
				/>
			)}
			{active?.key === "EditInstallationDialog" && (
				<EditInstallationDialog
					open={active?.key === "EditInstallationDialog"}
					{...((active?.key === "EditInstallationDialog"
						? active.props
						: {}) as DialogMap["EditInstallationDialog"])}
				/>
			)}
			{active?.key === "EditServerDialog" && (
				<EditServerDialog
					open={active?.key === "EditServerDialog"}
					{...((active?.key === "EditServerDialog"
						? active.props
						: {}) as DialogMap["EditServerDialog"])}
				/>
			)}
			{active?.key === "ImportInstallationDialog" && (
				<ImportInstallationDialog
					open={active?.key === "ImportInstallationDialog"}
				/>
			)}
			{active?.key === "RemoveModDialog" && (
				<RemoveModDialog
					open={active?.key === "RemoveModDialog"}
					{...((active?.key === "RemoveModDialog"
						? active.props
						: {}) as DialogMap["RemoveModDialog"])}
				/>
			)}
			{active?.key === "UpdateModDialog" && (
				<UpdateModDialog
					open={active?.key === "UpdateModDialog"}
					{...((active?.key === "UpdateModDialog"
						? active.props
						: {}) as DialogMap["UpdateModDialog"])}
				/>
			)}
			{active?.key === "EditWorldDialog" && (
				<EditWorldDialog
					open={active?.key === "EditWorldDialog"}
					{...((active?.key === "EditWorldDialog"
						? active.props
						: {}) as DialogMap["EditWorldDialog"])}
				/>
			)}
			{active?.key === "DeleteWorldDialog" && (
				<DeleteWorldDialog
					open={active?.key === "DeleteWorldDialog"}
					{...((active?.key === "DeleteWorldDialog"
						? active.props
						: {}) as DialogMap["DeleteWorldDialog"])}
				/>
			)}
			{active?.key === "ViewMapDialog" && (
				<ViewMapDialog
					open={active?.key === "ViewMapDialog"}
					{...((active?.key === "ViewMapDialog"
						? active.props
						: {}) as DialogMap["ViewMapDialog"])}
				/>
			)}
			{active?.key === "DuplicateInstallationDialog" && (
				<DuplicateInstallationDialog
					open={active?.key === "DuplicateInstallationDialog"}
					{...((active?.key === "DuplicateInstallationDialog"
						? active.props
						: {}) as DialogMap["DuplicateInstallationDialog"])}
				/>
			)}
			{active?.key === "ImportModsDialog" && (
				<ImportModsDialog
					open={active?.key === "ImportModsDialog"}
					{...((active?.key === "ImportModsDialog"
						? active.props
						: {}) as DialogMap["ImportModsDialog"])}
				/>
			)}
			{active?.key === "SaveModProfileDialog" && (
				<SaveModProfileDialog
					open={active?.key === "SaveModProfileDialog"}
					{...((active?.key === "SaveModProfileDialog"
						? active.props
						: {}) as DialogMap["SaveModProfileDialog"])}
				/>
			)}
			{active?.key === "RestoreWorldDialog" && (
				<RestoreWorldDialog
					open={active?.key === "RestoreWorldDialog"}
					{...((active?.key === "RestoreWorldDialog"
						? active.props
						: {}) as DialogMap["RestoreWorldDialog"])}
				/>
			)}
			<Toaster richColors theme={darkMode ? "dark" : "light"} />
		</React.Fragment>
	);
}

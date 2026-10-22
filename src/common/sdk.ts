import * as SDK from "azure-devops-extension-sdk";
import { getClient, type IExtensionDataManager, type IExtensionDataService, type IHostNavigationService, type IHostPageLayoutService, type IProjectPageService } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking";
import type { UserInfo } from "./domain/types";

// CommonServiceIds is an ambient const enum (not usable with isolatedModules), so its values are copied here.
const CommonServiceIds = {
  ExtensionDataService: "ms.vss-features.extension-data-service",
  HostNavigationService: "ms.vss-features.host-navigation-service",
  HostPageLayoutService: "ms.vss-features.host-page-layout-service",
  ProjectPageService: "ms.vss-tfs-web.tfs-page-data-service",
} as const;

let dataManager: Promise<IExtensionDataManager> | undefined;
let project: Promise<{ id: string; name: string }> | undefined;

/** Initializes the SDK; the page calls notifyLoadSucceeded once its first render is done. */
export async function initSdk(): Promise<void> {
  await SDK.init({ loaded: false, applyTheme: true });
  await SDK.ready();
}

export function getUser(): UserInfo {
  const u = SDK.getUser();
  return { id: u.id, displayName: u.displayName, email: u.name };
}

export function getProject(): Promise<{ id: string; name: string }> {
  project ??= SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService)
    .then((s) => s.getProject())
    .then((p) => {
      if (!p) throw new Error("Projeto não encontrado no contexto da página.");
      return { id: p.id, name: p.name };
    });
  return project;
}

export function getDataManager(): Promise<IExtensionDataManager> {
  dataManager ??= (async () => {
    const [service, token] = await Promise.all([SDK.getService<IExtensionDataService>(CommonServiceIds.ExtensionDataService), SDK.getAccessToken()]);
    return service.getExtensionDataManager(SDK.getExtensionContext().id, token);
  })();
  return dataManager;
}

export function witClient(): WorkItemTrackingRestClient {
  return getClient(WorkItemTrackingRestClient);
}

export function coreClient(): CoreRestClient {
  return getClient(CoreRestClient);
}

/** "publisher.extension" of the running extension (e.g. tiino.time-tracker). */
export function extensionFullId(): string {
  const ext = SDK.getExtensionContext();
  return `${ext.publisherId}.${ext.extensionId}`;
}

/** Full id of one of this extension's contributions. */
export function contributionId(shortId: string): string {
  return `${extensionFullId()}.${shortId}`;
}

export async function hostLayout(): Promise<IHostPageLayoutService> {
  return SDK.getService<IHostPageLayoutService>(CommonServiceIds.HostPageLayoutService);
}

export async function hostNavigation(): Promise<IHostNavigationService> {
  return SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService);
}

/** OK/Cancel message dialog in the host frame. */
export async function confirmDialog(message: string, title: string, okText = "Confirmar", cancelText = "Cancelar"): Promise<boolean> {
  const layout = await hostLayout();
  return new Promise((resolve) => {
    layout.openMessageDialog(message, { title, okText, cancelText, showCancel: true, onClose: (r) => resolve(!!r) });
  });
}

export async function messageDialog(message: string, title: string): Promise<void> {
  const layout = await hostLayout();
  return new Promise((resolve) => layout.openMessageDialog(message, { title, showCancel: false, onClose: () => resolve() }));
}

export async function workItemUrl(id: number): Promise<string> {
  const host = SDK.getHost();
  const p = await getProject();
  return `https://dev.azure.com/${host.name}/${encodeURIComponent(p.name)}/_workitems/edit/${id}`;
}

export { SDK };

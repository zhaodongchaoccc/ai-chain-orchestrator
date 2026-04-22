export interface RequirementsRoute {
  name: "requirements";
}

export interface RequirementDetailRoute {
  name: "requirement-detail";
  requirementId: string;
}

export interface SystemRoute {
  name: "system";
}

export type AppRoute = RequirementsRoute | RequirementDetailRoute | SystemRoute;

export function parseAppRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/u, "") || "/";

  if (normalizedPath === "/") {
    return { name: "requirements" };
  }

  if (normalizedPath === "/system") {
    return { name: "system" };
  }

  const requirementMatch = normalizedPath.match(/^\/req\/([^/]+)$/u);
  if (requirementMatch) {
    return {
      name: "requirement-detail",
      requirementId: decodeURIComponent(requirementMatch[1])
    };
  }

  return { name: "requirements" };
}

export function buildRequirementsPath() {
  return "/";
}

export function buildRequirementDetailPath(requirementId: string) {
  return `/req/${encodeURIComponent(requirementId)}`;
}

export function buildSystemPath() {
  return "/system";
}

export function buildRoutePath(route: AppRoute) {
  switch (route.name) {
    case "system":
      return buildSystemPath();
    case "requirement-detail":
      return buildRequirementDetailPath(route.requirementId);
    case "requirements":
    default:
      return buildRequirementsPath();
  }
}

export function appendAiPrompt(path: string, prompt: string) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("aiPrompt", prompt);
  return `${url.pathname}${url.search}`;
}

export function navigateTo(path: string) {
  const nextUrl = new URL(path, window.location.origin);
  const nextPath = `${nextUrl.pathname}${nextUrl.search}`;
  const currentPath = `${window.location.pathname}${window.location.search}`;

  if (currentPath === nextPath) {
    return;
  }

  window.history.pushState({}, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

import { useEffect, useState } from "react";

import { RequirementDetailPage } from "./pages/RequirementDetailPage";
import { RequirementsPage } from "./pages/RequirementsPage";
import { SystemPage } from "./pages/SystemPage";
import { buildRequirementDetailPath, buildRequirementsPath, buildRoutePath, buildSystemPath, navigateTo, parseAppRoute, type AppRoute } from "./lib/routes";
import "./styles/theme.css";

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.pathname));

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(parseAppRoute(window.location.pathname));
    };

    window.addEventListener("popstate", handleRouteChange);
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, []);

  useEffect(() => {
    const targetPath = `${buildRoutePath(route)}${window.location.search}`;
    if (`${window.location.pathname}${window.location.search}` !== targetPath) {
      navigateTo(targetPath);
    }
  }, [route]);

  const handleOpenRequirement = (requirementId: string) => {
    navigateTo(buildRequirementDetailPath(requirementId));
  };

  const handleOpenRequirements = () => {
    navigateTo(buildRequirementsPath());
  };

  const handleOpenSystem = () => {
    navigateTo(buildSystemPath());
  };

  if (route.name === "requirement-detail") {
    return <RequirementDetailPage key={route.requirementId} onBack={handleOpenRequirements} onOpenSystem={handleOpenSystem} requirementId={route.requirementId} />;
  }

  if (route.name === "system") {
    return <SystemPage onOpenRequirements={handleOpenRequirements} />;
  }

  return <RequirementsPage onOpenRequirement={handleOpenRequirement} onOpenSystem={handleOpenSystem} />;
}

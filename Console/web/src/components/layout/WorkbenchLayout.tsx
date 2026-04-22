import type { ReactNode } from "react";

interface WorkbenchLayoutProps {
  title: string;
  subtitle?: string;
  activeNav: "requirements" | "system";
  onOpenRequirements: () => void;
  onOpenSystem: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkbenchLayout({ title, subtitle, activeNav, onOpenRequirements, onOpenSystem, actions, children }: WorkbenchLayoutProps) {
  return (
    <div className="workbench-shell">
      <header className="topbar">
        <div>
          <p className="topbar__eyebrow">飞枢台</p>
          <h1 className="topbar__title">{title}</h1>
          {subtitle ? <p className="topbar__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="topbar__actions">{actions}</div> : null}
      </header>

      <div className="workbench-body">
        <aside className="sidebar">
          <button className={activeNav === "requirements" ? "sidebar__link sidebar__link--active" : "sidebar__link"} onClick={onOpenRequirements} type="button">需求</button>
          <button className={activeNav === "system" ? "sidebar__link sidebar__link--active" : "sidebar__link"} onClick={onOpenSystem} type="button">系统</button>
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

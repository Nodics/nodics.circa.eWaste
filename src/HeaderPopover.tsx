import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { X } from "lucide-react";
import "./headerPopover.css";

const Group = createContext<{
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
} | null>(null);

export function HeaderPopoverGroup({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Group.Provider value={{ openId, setOpenId }}>{children}</Group.Provider>
  );
}

/** Shared mouse, touch and keyboard behavior for the customer header. */
export function HeaderPopover({
  label,
  href,
  title,
  icon,
  children,
  dismissKey,
  className = "",
}: {
  label: string;
  href: string;
  title: string;
  icon: ReactNode;
  children: (close: () => void) => ReactNode;
  dismissKey?: string;
  className?: string;
}) {
  const id = useId(),
    group = useContext(Group);
  const [localOpen, setLocalOpen] = useState(false);
  const open = group ? group.openId === id : localOpen;
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLAnchorElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setOpen = (value: boolean) => {
    if (group) {
      group.setOpenId((current) =>
        value ? id : current === id ? null : current,
      );
    } else setLocalOpen(value);
  };
  const cancelClose = () => clearTimeout(timer.current);
  const close = () => {
    cancelClose();
    setOpen(false);
  };
  useEffect(() => {
    close();
  }, [dismissKey]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("popstate", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("popstate", close);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const element = panel.current;
      if (!element) return;
      element.style.transform = "none";
      const bounds = element.getBoundingClientRect();
      const shift =
        bounds.left < 16
          ? 16 - bounds.left
          : Math.min(0, window.innerWidth - 16 - bounds.right);
      element.style.transform = `translateX(${shift}px)`;
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);
  return (
    <div
      className={`header-popover ${className}`}
      ref={root}
      onPointerEnter={(event) => {
        cancelClose();
        if (event.pointerType === "mouse" && !open) {
          setOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse")
          timer.current = setTimeout(() => {
            if (!root.current?.contains(document.activeElement)) close();
          }, 180);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <a
        className="icon-button header-popover-trigger"
        ref={trigger}
        href={href}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={close}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() =>
              panel.current?.querySelector<HTMLElement>("a, button")?.focus(),
            );
          }
        }}
      >
        {icon}
      </a>
      {open && (
        <div
          className="header-popover-panel"
          ref={panel}
          id={id}
          role="dialog"
          aria-label={title}
        >
          <div className="header-popover-heading">
            <h2>{title}</h2>
            <button
              className="icon-button"
              aria-label="Close dialog"
              onClick={() => {
                close();
                trigger.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="header-popover-content">{children(close)}</div>
        </div>
      )}
    </div>
  );
}

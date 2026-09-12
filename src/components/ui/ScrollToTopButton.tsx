import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

const SHOW_AFTER_PX = 400;

/** Floating "back to top" shortcut for the Pro app's longer pages (Settings,
 * the estimate editor, Catalog) — fixed bottom-right, only visible once the
 * page has actually scrolled, so it never crowds a short page. */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    window.addEventListener("scroll", updateVisibility, { passive: true });
    updateVisibility();
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`no-print fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-forest text-lime shadow-lg transition-all duration-200 hover:bg-forest-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-surface focus-visible:ring-offset-2 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <ChevronUp size={20} aria-hidden="true" />
    </button>
  );
}

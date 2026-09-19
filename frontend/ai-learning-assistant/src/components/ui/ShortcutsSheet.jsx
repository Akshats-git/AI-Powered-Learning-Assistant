import Modal from "./Modal";

const SECTIONS = [
  { title: "Anywhere", items: [["Ctrl / ⌘ + K", "Open the command palette"], ["/", "Search (when not typing)"], ["?", "Show this sheet"], ["Esc", "Close a dialog or the palette"]] },
  { title: "Flashcards and review", items: [["Space", "Flip the card"], ["1 · 2 · 3 · 4", "Grade: Again · Hard · Good · Easy"], ["← →", "Previous / next card"]] },
  { title: "Command palette", items: [["↑ ↓", "Move through results"], ["Enter", "Open the highlighted result"]] },
];

const ShortcutsSheet = ({ onClose }) => (
  <Modal title="Keyboard shortcuts" onClose={onClose}>
    <div className="space-y-5">
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{section.title}</h4>
          <dl className="space-y-1.5">
            {section.items.map(([keys, what]) => (
              <div key={keys} className="flex items-center justify-between gap-4 text-sm">
                <dt>
                  <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-600">{keys}</kbd>
                </dt>
                <dd className="text-gray-600">{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  </Modal>
);

export default ShortcutsSheet;

import Modal from "./Modal";
import MarkdownRenderer from "./MarkdownRenderer";

const MarkdownModal = ({ title, content, loading, onClose }) => (
  <Modal title={title} onClose={onClose} size="lg">
    {loading ? (
      <div className="space-y-3 animate-pulse">
        <div className="h-3 w-3/4 bg-gray-100 rounded" />
        <div className="h-3 w-full bg-gray-100 rounded" />
        <div className="h-3 w-5/6 bg-gray-100 rounded" />
        <div className="h-3 w-2/3 bg-gray-100 rounded" />
      </div>
    ) : (
      <MarkdownRenderer content={content} />
    )}
  </Modal>
);

export default MarkdownModal;

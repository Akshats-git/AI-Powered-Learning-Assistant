import Modal from "./Modal";

const ConfirmDeleteModal = ({ title = "Delete this item?", description, onCancel, onConfirm, deleting }) => (
  <Modal
    title={title}
    onClose={onCancel}
    size="sm"
    footer={
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    }
  >
    <p className="text-sm text-gray-500">{description || "This action cannot be undone."}</p>
  </Modal>
);

export default ConfirmDeleteModal;

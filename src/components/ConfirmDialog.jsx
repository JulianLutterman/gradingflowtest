import PropTypes from 'prop-types';

function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="modal-content confirm-modal-content">
        <button type="button" className="modal-close" aria-label="Close confirmation dialog" onClick={onCancel}>
          ×
        </button>
        <h3 id="confirm-modal-title">{title}</h3>
        <p>{description}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="cancel-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="save-btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default ConfirmDialog;

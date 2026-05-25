import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  danger = false
}) => {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 2000,
        animation: 'fade-in 0.2s ease-out'
      }}
      onClick={onCancel}
    >
      <div 
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '20px',
          padding: '24px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
          animation: 'slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'white', margin: 0 }}>
            {title}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
            {message}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button 
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ 
              flex: 1, 
              padding: '12px', 
              fontSize: '14px',
              borderRadius: '12px',
              fontWeight: 600
            }}
          >
            {cancelLabel}
          </button>
          
          <button 
            onClick={onConfirm}
            className="btn"
            style={{ 
              flex: 1, 
              padding: '12px', 
              fontSize: '14px',
              borderRadius: '12px',
              fontWeight: 600,
              backgroundColor: danger ? 'var(--color-cal)' : 'var(--accent)',
              color: 'white',
              boxShadow: 'none',
              border: 'none'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

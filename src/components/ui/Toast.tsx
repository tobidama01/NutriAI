import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  isVisible,
  onClose
}) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const getStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'rgba(16, 185, 129, 0.95)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          icon: <CheckCircle size={18} style={{ color: 'white' }} />
        };
      case 'error':
        return {
          bg: 'rgba(239, 68, 68, 0.95)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          icon: <AlertTriangle size={18} style={{ color: 'white' }} />
        };
      default:
        return {
          bg: 'rgba(59, 130, 246, 0.95)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          icon: <Info size={18} style={{ color: 'white' }} />
        };
    }
  };

  const styleConfig = getStyles();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(var(--tabbar-height) + var(--safe-area-bottom) + 16px)',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: styleConfig.bg,
        border: styleConfig.border,
        color: 'white',
        padding: '12px 18px',
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
        zIndex: 3000,
        maxWidth: '90%',
        width: 'max-content',
        animation: 'slide-up-toast 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        fontSize: '13px',
        fontWeight: 600,
        backdropFilter: 'blur(8px)'
      }}
    >
      {styleConfig.icon}
      <span>{message}</span>
    </div>
  );
};

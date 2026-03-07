import { useEffect, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function AppErrorBoundary({ children }: Props) {
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setErrorMessage(event.message || '未知运行时错误');
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof Error) {
        setErrorMessage(reason.message);
      } else if (typeof reason === 'string') {
        setErrorMessage(reason);
      } else {
        setErrorMessage('发生未处理的异步错误');
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  if (errorMessage) {
    return (
      <div className="h-screen w-full bg-app-bg flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-lg p-5 max-w-xl w-full">
          <h2 className="text-red-600 font-bold text-base mb-2">应用发生错误</h2>
          <p className="text-sm text-gray-700 mb-3">页面已被保护，未发生跳转。请刷新后重试。</p>
          <pre className="text-xs bg-red-50 border border-red-100 rounded p-3 whitespace-pre-wrap break-all text-red-700">
            {errorMessage}
          </pre>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

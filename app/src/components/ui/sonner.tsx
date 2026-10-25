import { Toaster as Sonner, type ToasterProps } from 'sonner';

const TOAST =
  'group/toast pointer-events-auto relative flex w-full items-start gap-2.5 rounded-lg border-l-[3px] px-3 py-2.5 text-sm shadow-md';

/**
 * Avisos temporales de la aplicación (`toast.success`, `toast.warning`…), con los mismos tonos
 * pastel de los eventos. Van abajo a la derecha en escritorio y sobre la barra inferior en móvil.
 * El color nunca va solo: cada tipo lleva su ícono y el texto del mensaje.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      offset={24}
      mobileOffset={{ bottom: '5.5rem', left: '1rem', right: '1rem' }}
      closeButton
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: 'Cerrar aviso',
        classNames: {
          toast: TOAST,
          success: 'border-event-green-border bg-event-green-bg text-event-green-text',
          error: 'border-event-red-border bg-event-red-bg text-event-red-text',
          warning: 'border-event-amber-border bg-event-amber-bg text-event-amber-text',
          info: 'border-event-blue-border bg-event-blue-bg text-event-blue-text',
          icon: 'mt-0.5 size-4 shrink-0',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'font-medium',
          description: 'opacity-90',
          actionButton:
            'ml-auto inline-flex h-7 shrink-0 items-center rounded-md bg-current/15 px-2.5 text-xs font-semibold outline-none hover:bg-current/25 focus-visible:ring-[3px] focus-visible:ring-ring/40',
          closeButton:
            'absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-md opacity-70 outline-none hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };

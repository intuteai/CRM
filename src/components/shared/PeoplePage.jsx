// Page chrome for the people-management roles (HR / Employee / IA HR / IA Employee):
// the warm gradient with soft animated colour blobs, plus a compact left-aligned page header.
// These roles have no sidebar/TopHeader shell, so each page renders its own title here.

export function PeopleBackdrop({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 anim-drift"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 anim-drift [animation-delay:-3s]"></div>
      <div className="absolute -bottom-32 left-[calc(50%-12rem)] w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 anim-drift [animation-delay:-6s]"></div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// The page title is shown by the top header (same as every other role), so it is only kept here as
// visually-hidden text. `subtitle` may be text or JSX; `actions` renders on the right (buttons etc.).
function PeoplePage({ title, subtitle, actions, width = 'max-w-7xl', children }) {
  return (
    <PeopleBackdrop>
      <div className={`${width} mx-auto px-6 py-6`}>
        <h2 className="sr-only">{title}</h2>
        {(subtitle || actions) && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="min-w-0 text-sm text-gray-500">{subtitle}</div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </PeopleBackdrop>
  );
}

export default PeoplePage;

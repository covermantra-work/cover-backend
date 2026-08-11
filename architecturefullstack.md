# CoverMantra Fullstack Architecture

**Last Updated:** 5 August 2026

## Project Vision
CoverMantra is a loan aggregator and insurance advisory platform. The fullstack product should provide a polished, responsive web experience while aggregating loan offers from partner lenders in real time.

## Current Setup
- `coverbackend/` — Node.js + Express API server with MongoDB (and a fallback local JSON database for lender priority storage: `data/lenders.json`).
- `coverfrontend/` — Next.js 16 React web application

## Target Fullstack Architecture
- **Backend:** Go service for API, aggregation, auth, and lender adapters
- **Frontend:** Go-based UI option or modern JS UI with clear migration path
- **Data Store:** PostgreSQL for transactional data; Redis for caching
- **Infrastructure:** Docker + Kubernetes / Docker Compose for local dev
- **CI/CD:** GitHub Actions builds and deploys backend and frontend

## Fullstack Layers
1. **Client Layer**
   - Responsive UI across desktop, tablet, and mobile
   - Home page, loan comparison, application forms, dashboard, user profile
   - Mobile-first design with accessible tables and cards

2. **API Layer**
   - Authentication and user profile routes
   - Loan search and aggregator endpoints
   - Partner integration triggers
   - Admin management APIs: `/api/lenders/reorder` (PUT), `/api/lenders` (POST/PUT/DELETE) for managing display priority.

3. **Domain Layer**
   - Business rules for eligibility, scoring, normalization
   - Loan request orchestration
   - Offer ranking and comparison

4. **Persistence Layer**
   - User, lender, loan request, offer, OTP
   - Audit logging and event history
   - Partner response storage

5. **Infrastructure Layer**
   - Network, reverse proxy, logs, metrics
   - Cache and queue systems
   - Secure secret management

## Key Data Flow
### Eligibility & Filter Flow
1. User enters loan details or requests eligibility.
2. Frontend sends request to backend API (`/api/user/eligibility` or `/api/user/filter-lenders`).
3. Backend fetches active lenders:
   - Queries MongoDB collection `lenders` sorted by priority.
   - If a connection or database permission issue occurs, it safely falls back to the static `lenderList.js`.
4. Filters lenders based on age, income, and pincode matching criteria.
5. Returns normalized results to the frontend.

### Admin Priority Reordering Flow
1. Admin navigates to `/admin/lenders` on frontend.
2. Drags and drops lenders using `framer-motion` to set desired ordering.
3. Submits array of reordered IDs with the `Admin Secret Key` (`x-admin-secret` header).
4. Backend verifies the header secret or user JWT role (`role === 'admin'`).
5. Backend updates priority values and stores updated list in `coverbackend/data/lenders.json`.

## Frontend Architecture
- **Current stack:** Next.js, Tailwind CSS, React Context, Framer Motion (for drag-and-drop), React Toastify
- **Responsive UI:** breakpoints for mobile/tablet/desktop
- **Components:** Navbar, Hero, OfferTable, LoginModal, Dashboard, ChatBot, Footer, AdminLenderManagement (`/admin/lenders`)
- **API client:** Axios wrapper with centralized endpoints
- **Authentication:** OTP flow with cookies and JWT

## Backend Architecture
- **Current stack:** Express, MongoDB, Mongoose, Axios, local JSON fallback storage (`data/lenders.json`)
- **Proposed stack:** Go, `chi`, `sqlx`, `golang-migrate`, `zap`, OpenTelemetry
- **Important modules:** `app.js`, `routes/userRoutes.js`, `routes/lenderRoutes.js`, `models/Lender.js`, `models/Users.js`, `PartnerRoutes/*`

### Lender API Integration (Adapter Pattern)
1. **Dynamic Routing:** All partner integrations are mapped dynamically in `routes/partnerRoutes.js` via the `:lenderId` parameter (e.g. `/api/partners/:lenderId/form-config` and `/api/partners/:lenderId/register`).
2. **Standardized Interfaces (BaseAdapter):** Every lender integration is decoupled from the route code by extending a standard template `BaseAdapter.js`.
3. **Lender-Specific Adapters:** Specific classes under `adapters/` (such as `MoneyviewAdapter`, `ZypeAdapter`, `VivifiAdapter`, `FatakpayPlAdapter`, and `FatakpayDclAdapter`) handle authentication token retrieval, custom payloads, error handling, and API invocation for their respective partner.
4. **Adapter Registration:** The adapters are registered as unified key-value exports in `adapters/index.js`, allowing `partnerRoutes` to automatically route incoming requests to the appropriate adapter instance.
5. **Centralized Lead Logging:** Standardized responses from the adapters are automatically logged into the MongoDB databases (`LenderResponse` and `webusername` collections) by the route handler.

## Migration Strategy
- Keep current repo structure until new Go backend is ready
- Build new backend alongside old one in `coverbackend/`
- Migrate feature-by-feature: auth, lenders, aggregation, admin
- Keep frontend API contracts stable during migration
- Use API gateway or versioned routes if needed


## UI/UX Requirements
- Loan aggregator homepage with hero search
- Loan comparison tables that adapt to mobile
- Lender detail pages with rates and fees
- User dashboard with profile and history
- Interactive Admin panel for dynamic lender priority reordering (`framer-motion` list at `/admin/lenders`)
- Notifications and error handling in frontend using `react-toastify`

## Security & Compliance
- **Authentication**: OTP security with rate limiting (using `express-rate-limit` middleware on `/send-otp` and `/verify-otp`).
- **Dynamic Role Verification**: JWT authentication backed by dynamic database-level checks for administrators (resolves the JWT payload phone against the database role column in `combinedAdminAuth`).
- **Data Validation & Sanitization**: Strict route-level verification for PAN cards (`isValidPAN`), Mobile numbers (`isValidMobileNumber`), and Email formats (`isValidEmail` regex validation).
- **Consent Tracking**: Explicit storage of user consent (boolean state and exact legal statement text) recorded on user registration models.
- **Deduplication & Anti-Flood**: Frontend-level form locking (`isSubmitting` status) that disables submissions and shows visual loaders, paired with backend adapterLocks.
- **Dual-Mode Admin Access**: Verified via `x-admin-secret` header token checks or JWT role check.
- **Secure Access Rules**: No wildcard CORS configurations; Helmet security headers implemented for clickjacking/MIME-type enforcement.

## Operations & Monitoring
- Prometheus metrics and Grafana dashboards
- Alerts for errors, latency, and resource usage
- Health checks and readiness probes
- Log aggregation and request tracing

## Implementation Roadmap
1. Audit current code and API contracts
2. Design target Go backend schema and routes
3. Build new backend skeleton and basic auth
4. Migrate lender integrations one by one
5. Update frontend to call the new backend
6. Test end-to-end and deploy locally
7. Harden security and observability

## Conclusion
The updated fullstack architecture is now aligned with CoverMantra’s next product phase: a modern lending aggregator with a Go backend, responsive frontend, secure authentication, and production-ready infrastructure.

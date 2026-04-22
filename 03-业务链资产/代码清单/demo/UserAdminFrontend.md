# UserAdminFrontend Code List

## Components

### Pages
- `src/pages/UserListPage.tsx` — User list with search/filter
- `src/pages/UserDetailPage.tsx` — User edit form
- `src/pages/UserCreatePage.tsx` — Multi-step create form

### Shared Components
- `src/components/UserTable.tsx` — Data table with sorting
- `src/components/UserForm.tsx` — Reusable form component
- `src/components/RoleSelector.tsx` — Role assignment dropdown
- `src/components/DeleteConfirmDialog.tsx` — Confirmation modal

## Hooks

- `src/hooks/useUsers.ts` — User list query
- `src/hooks/useUser.ts` — Single user query/mutation
- `src/hooks/useAuth.ts` — Authentication state

## API Layer

- `src/api/userApi.ts` — User CRUD API calls
- `src/api/authApi.ts` — Auth API calls
- `src/api/client.ts` — Axios instance with interceptors

## Types

- `src/types/user.ts` — User interfaces
- `src/types/auth.ts` — Auth interfaces

# UserAuthBackend Code List

## Implementation Files

### Entity Layer
- `src/main/java/com/example/user/entity/User.java`
  - Fields: id, username, email, passwordHash, role, createdAt, updatedAt, deletedAt
  - Annotations: `@Entity`, `@Table`, `@Where(clause = "deleted_at IS NULL")`

### Repository Layer
- `src/main/java/com/example/user/repository/UserRepository.java`
  - Extends `JpaRepository<User, Long>`
  - Methods: `findByUsername`, `findByEmail`, `softDeleteById`

### Service Layer
- `src/main/java/com/example/user/service/UserService.java`
  - Methods: `createUser`, `updateUser`, `deleteUser`, `findUser`, `listUsers`
- `src/main/java/com/example/user/service/AuthService.java`
  - Methods: `authenticate`, `generateToken`, `validateToken`

### Controller Layer
- `src/main/java/com/example/user/controller/UserController.java`
  - Endpoints: `POST /api/users`, `GET /api/users`, `GET /api/users/:id`, `PUT /api/users/:id`, `DELETE /api/users/:id`
- `src/main/java/com/example/user/controller/AuthController.java`
  - Endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`

### DTO Layer
- `src/main/java/com/example/user/dto/UserDTO.java`
- `src/main/java/com/example/user/dto/CreateUserRequest.java`
- `src/main/java/com/example/user/dto/UpdateUserRequest.java`
- `src/main/java/com/example/user/dto/AuthRequestDTO.java`
- `src/main/java/com/example/user/dto/AuthResponseDTO.java`

## Test Files

- `src/test/java/com/example/user/service/UserServiceTest.java`
- `src/test/java/com/example/user/service/AuthServiceTest.java`
- `src/test/java/com/example/user/controller/UserControllerTest.java`

## Database

- `src/main/resources/db/migration/V001__create_users_table.sql`

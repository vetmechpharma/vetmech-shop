# VETMECH Auth Testing

## Admin auth (JWT Bearer, token in response body, stored in localStorage `vm_admin_token`)
- POST /api/auth/admin/login  {email, password} -> {token, user}
- GET  /api/auth/admin/me  (Authorization: Bearer <token>)
- Seeded super admin: vetmechpharma@gmail.com / Admin@123

## Customer auth (WhatsApp OTP, mocked)
- POST /api/auth/otp/request {mobile} -> {dev_otp}  (OTP returned in response in demo mode)
- POST /api/auth/otp/verify  {mobile, otp} -> {verified, registered, token?, customer?}
- Token stored in localStorage `vm_customer_token`
- GET /api/auth/customer/me

## Quick curl
curl -s -X POST http://localhost:8001/api/auth/admin/login -H "Content-Type: application/json" -d '{"email":"vetmechpharma@gmail.com","password":"Admin@123"}'

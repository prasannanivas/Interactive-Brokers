"""Quick script to create a test user"""
import requests

# Create a new user
response = requests.post(
    "http://localhost:8001/auth/register",
    json={
        "email": "test@demo.com",
        "username": "testuser",
        "password": "Test123!",
        "full_name": "Test User"
    }
)

print("Registration:", response.status_code)
if response.status_code == 201:
    print("✓ User created successfully!")
    print("  Email: test@demo.com")
    print("  Password: Test123!")
elif response.status_code == 400:
    print("❌ User already exists. Try logging in with:")
    print("  Email: test@demo.com")
    print("  Password: Test123!")
else:
    print(response.json())

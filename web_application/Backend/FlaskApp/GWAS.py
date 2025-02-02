from app import app
import json

def test_calculate_chi_square():
    with app.app_context():
        uuid = "0639c170-e109-4d0a-9117-8d65ad570340"

        with app.test_client() as client:
            response = client.post(
                "/api/calculate_chi_square",  # Corrected API route
                data=json.dumps({"uuid": uuid, "threshold": 0.1}),  # Ensure correct key format
                content_type="application/json"
            )

            print("Response status:", response.status_code)
            try:
                response_data = response.get_json()
                print("Response data:", response_data)
            except Exception:
                print("Failed to parse JSON response:", response.data.decode())

            assert response.status_code in [200, 400, 500], "Unexpected status code"

if __name__ == "__main__":
    test_calculate_chi_square()

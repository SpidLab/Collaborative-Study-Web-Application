from app import app, initiate_qc
import json

def main():
    with app.app_context():
        uuid = "0639c170-e109-4d0a-9117-8d65ad570340"
        collaboration_data = initiate_qc(uuid)

        if collaboration_data:
            print("Collaboration data retrieved:", collaboration_data)
        else:
            print("Collaboration not found.")

        # Use Flask test client
        with app.test_client() as client:
            response = client.post(
                f"/api/datasets/{uuid}/qc-results",
                data=json.dumps({"threshold": 0.1}),  # Send test threshold value
                content_type="application/json"
            )

            print("Response status:", response.status_code)
            print("Response data:", response.get_json())

if __name__ == "__main__":
    main()

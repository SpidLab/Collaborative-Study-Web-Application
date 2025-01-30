from app import app, db
import os

def test_upload_csv_stats():
    with app.app_context():
        # Define test parameters
        uuid = "0639c170-e109-4d0a-9117-8d65ad570340"
        token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2ZjJkYmNjMDE1OTE0YzdlMmQ1ODcwYSIsImV4cCI6MTczODM1NzgwMi4yMTgwOX0.rd_BugXtGVF-eoDK7VmYDszpFrVfrPnQy82vVprPYcQn"  # Replace with an actual token
        file_path = "example_stat.csv"

        # Check if the file exists before proceeding
        if not os.path.exists(file_path):
            print(f"❌ File not found: {file_path}")
            return

        # Prepare the request data and headers
        headers = {"Authorization": f"Bearer {token}"}
        with open(file_path, "rb") as file:
            files = {"file": (file_path, file, "text/csv")}
            data = {"uuid": uuid}

            # Use Flask's test_client to send the request
            with app.test_client() as client:
                response = client.post(
                    "/api/upload_csv_stats",
                    headers=headers,
                    data=data,
                    content_type="multipart/form-data"
                )

                # Check the response
                if response.status_code == 200:
                    print("✅ CSV upload successful:", response.json)
                else:
                    print("❌ CSV upload failed:", response.status_code, response.json)

                # Check if data is stored correctly
                collaboration_data = db["collaboration"].find_one({"uuid": uuid})

                if collaboration_data:
                    print("✅ Collaboration data retrieved:", collaboration_data)
                else:
                    print("❌ Collaboration data not found.")

if __name__ == "__main__":
    test_upload_csv_stats()

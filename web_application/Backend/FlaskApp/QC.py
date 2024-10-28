from app import app
from app import qc

def main():

    with app.app_context():
        uuid = "7ef42880-e378-416f-915e-14e8c513049f"
        collaboration_data = qc(uuid)

        if collaboration_data:
            print("Collaboration data retrieved:", collaboration_data)
        else:
            print("Collaboration not found.")

if __name__ == "__main__":
    main()
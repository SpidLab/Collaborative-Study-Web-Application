from app import app
from app import initiate_qc
from app import get_filtered_qc_results


def main():

    with app.app_context():
        uuid = "7ef42880-e378-416f-915e-14e8c513049f"
        collaboration_data = initiate_qc(uuid)

        if collaboration_data:
            print("Collaboration data retrieved:", collaboration_data)
        else:
            print("Collaboration not found.")

        filtered_results = get_filtered_qc_results(uuid)

        if filtered_results:
            print("Filtered results retrieved:", filtered_results)
        else:
            print("Filtered Results not found.")

if __name__ == "__main__":
    main()
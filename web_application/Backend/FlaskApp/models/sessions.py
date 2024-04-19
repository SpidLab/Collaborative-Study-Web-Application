from mongoengine import Document, StringField, ListField

class Session(Document):
    sessionID = StringField(required=True, min_length=1)
    userID = StringField(required=True, min_length=1)
    metadataID = StringField(required=True, min_length=1)
    collaborators = ListField(StringField(min_length=1))  # List of user IDs for the retrieval of collaborators
    status = StringField(required=True, default="in_progress")  # "in_progress" or "completed"
    results = DictField()  # Stores the results of the calculations

    def to_json(self):
        # Convert document to JSON
        return {
            "sessionID": self.sessionID,
            "userID": self.userID,
            "metadataID": self.metadataID,
            "collaborators": self.collaborators
        }

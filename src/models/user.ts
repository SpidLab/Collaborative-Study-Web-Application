import mongoose, { Document } from "mongoose";

const Schema = mongoose.Schema;

export type UserDocument = Document & {
    username: string;
    email: string;
    googleId: string;
  };
  
  const userSchema = new Schema<UserDocument>({
    username: String,
    email: String,
    googleId: String,
  });
  
  const User = mongoose.model<UserDocument>("User", userSchema);
  
  export default User;

/*userSchema.set('toJSON', {
    transform: (_document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
        return returnedObject
    }
})

const User = mongoose.model('User', userSchema)

export default User */
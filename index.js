const express = require("express");
const multer = require("multer");
const path = require("path");
const AWS = require("aws-sdk");
require("dotenv").config();

//Cấu hình AWS
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";

//Cấu hình aws sdk để truy cập vào Cloud aws thông qua tài khoản IAM Users
AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3(); //khai bao S3
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

//multer.diskStorage để chỉ định cách Multer sẽ lưu trữ các tệp đã tải lên trên ổ đĩa của máy chủ.
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null,  './image') // Thư mục lưu trữ hình ảnh
//   },
//   filename: function (req, file, cb) {
//     cb(null, file.originalname)
//   }
// });

// const upload = multer({ storage: storage });

//Cấu hình multer quản lý upload image
const storage = multer.memoryStorage({
  destination(req, file, cb) {
    cb(null, "");
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2000000 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});

function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png|gif/;

  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  return cb("Error: Pls upload images /jpeg|jpg|png|gif/");
}

const PORT = 3001;
const app = express();
// let data = require("./store");
// const { table } = require("console");

//register middlewares
// Middleware là các hàm hoặc các tác vụ trung gian được thực thi trước khi yêu cầu
// của người dùng đến các tác vụ cuối cùng của ứng dụng, chẳng hạn như xử lý yêu cầu HTTP hoặc gửi phản hồi.

app.use(express.json({ extended: false }));
app.use(express.static("./image"));
app.use(express.static("./views"));
//config view
app.set("view engine", "ejs");
app.set("views", "./views");
// routers
app.get("/", async (req, resp) => {
  try {
    const params = { TableName: tableName };
    const data = await dynamoDB.scan(params).promise();
    console.log("data: ", data.Items);
    return resp.render("index.ejs", { data: data.Items });
  } catch (error) {
    console.error("Error retrieving data from DynamoDB", console.error());
    return resp.status(500).send("Internal Server Error");
  }
});

app.post("/save", upload.single("image"), (req, res) => {
  try {
    const sub_id = Number(req.body.sub_id);
    const name = req.body.name;
    const course_type = req.body.course_type;
    const semester = req.body.semester;
    const department = req.body.department;
    const image = req.file?.originalname.split(".");
    const fileType = image[image.length - 1];
    const filePath = `${sub_id}_${Date.now().toString()}.${fileType}`;

    const paramS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    s3.upload(paramS3, async (err, data) => {
      if (err) {
        console.error("Error= ", err);
        return res.send("Internal server error!");
      } else {
        const imageURL = data.Location;
        const paramsDynamoDb = {
          TableName: tableName,
          Item: {
            sub_id: Number(sub_id),
            name: name,
            course_type: course_type,
            semester: semester,
            department: department,
            image: imageURL,
          },
        };
        await dynamoDB.put(paramsDynamoDb).promise();
        return res.redirect("/");
      }
    });
  } catch (error) {
    console.error("Error saving data from DynamoDB: ", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.post("/deleted", upload.fields([]), (req, res) => {
  let selectedCourses = req.body.selectedCourses;
  console.log("selectedCourses:", req.body.selectedCourses);

  // Đảm bảo selectedCourses luôn là một mảng ngay cả khi chỉ có một môn được chọn
  if (!Array.isArray(selectedCourses)) {
    selectedCourses = [selectedCourses];
  }
  console.log("selectedCourses:", req.body.selectedCourses);
 
  if (!selectedCourses || selectedCourses.length <= 0) {
    return res.redirect("/");
  }
  try {
    function onDeleteItem(length) {
      const params = {
        TableName: tableName,
        Key: {
          sub_id: Number(selectedCourses[length]),
        },
        
      };
      console.log("params", params);
      dynamoDB.delete(params, (err, data) => {
        if (err) {
          console.log("error= ", err);
          return res.send("Interal Server Error!");
        } else if (length > 0) onDeleteItem(length - 1);
        else return res.redirect("/");
      });
    }
    onDeleteItem(selectedCourses.length - 1);
  } catch (error) {
    console.error("Error deleting data from DynamoDB: ", error);
    return res.status(500).send("Internal Serer Error");
  }
});



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

import json
from .database import connect_database

connection = connect_database()
try:
    with connection.cursor(dictionary=True) as cursor:
        cursor.execute("SELECT * FROM notifications ORDER BY processed_at DESC")
        print(json.dumps(cursor.fetchall(), default=str, ensure_ascii=False, indent=2))
finally:
    connection.close()
